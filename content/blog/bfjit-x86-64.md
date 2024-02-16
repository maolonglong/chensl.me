+++
title = "实现一个最小的 JIT 编译器"
date = 2024-02-16T15:34:05+08:00
draft = false
toc = true
tags = ["jit", "zig", "brainfuck"]
+++

[Brainfuck](https://en.wikipedia.org/wiki/Brainfuck) (简称 bf) 是一种极小的语言，小到只有 4 种操作用来控制内存（一般就是一个很大的 bytes 数组）

- `<`, `>`: 指针左移、右移
- `+`, `-`: 当前指针所指内存的值加 1 或减 1
- `,`, `.`: 输入、输出 (当前所指内存的值)
- `[`, `]`: 循环结构
  - `[`: 如果指针所指内存值为 0，跳转到对应 `]` (类似 break)
  - `]`: 如果指针所指内存值不为 0，跳转到对应 `[`

最近看完 CSAPP - Machine-Level Programming 的部分，刚好用它练练手。实现语言不重要，有数组，栈，能调用 `mmap` 就行，我用了 Zig。

## Parser

首先是实现 parser，需要把 bf 代码文本解析成 token (或者叫 instruction)：

```zig
const Instruction = union(enum) {
    add: u8,
    move: i32,
    input,
    output,
    jump_right,
    jump_left,
};
```

一个小小的优化：

由于可能会有多个 `+`, `-`，连在一起，所以可以做一个批操作，把 `+1+1+1+1+1...` 合并成 `+n`。

`<`, `>` 也同理。

无聊的 parser，完整代码可以看文章最后，我们只需要处理几种特殊字符，剩下的直接忽略就行:

```zig
for (source) |b| {
    const inst = switch (b) {
        '+', '-' => ...,
        '>', '<' => ...,
        '.' => ...,
        ',' => ...,
        '[' => ...,
        ']' => ...,
        else => continue,
    };
    try instructions.append(inst);
}
```

## x86-64 ASM

接下来就是怎么把 instruction 转成 machine code 了。虽然在代码里我们是直接跳过汇编器生成 machine code，但是写代码的时候，还是得借助汇编器查看一下汇编指令对应的 machine code。

这里的汇编语法使用和 CSAPP 课程一样的 AT&T，所以可以借助 `as` 和 `objdump` 来获取 machine code：

```bash
$ cat test.s
add $0x1, %rdi
mov $rdi, %rax
ret

$ as -o test.o test.s && objdump -M att -d test.o

test.o:     file format elf64-x86-64


Disassembly of section .text:

0000000000000000 <.text>:
   0:   48 83 c7 01             add    $0x1,%rdi
   4:   48 c7 c0 00 00 00 00    mov    $0x0,%rax
   b:   c3                      ret
```

### ASM Procedure

我们需要在运行时，生成一个 ASM Procedure，它大概长这样：

```asm
push %r13        // 暂存 %r13，最后再还原
mov %rdi, %r13   // 按照约定第一个参数 (memory)，在 %rdi，把它放到 %r13
push %r12        // 暂存 %r12，最后再还原
xor %r12d, %r12d // 清零 (%r12 = 0)，用来表示当前指针在 memory 的位置

// ... 动态生成部分

pop %r12
pop %r13
ret
```

### Add

```zig
add: u8
```

之所以只有 `add` 没有 `sub` 是因为 `sub` 操作也能装换成 `add`。(利用 wrapping_add 的语义)

例如 `2 - 1` 就等于 `(2 + 255) % 256`。

asm:

```asm
// ... 部分用具体的数值替换
// %r13[%r12] += ...
addb ..., (%r13,%r12,1)
```

### Move

```zig
move: i32
```

因为正负（左移右移），可能会生成两种 asm:

```asm
add ..., %r12
// OR
sub ..., %r12
```

### Input/Output

输入输出稍微复杂些，因为要用到 syscall:

`read`:

```asm
mov $0x0, %eax             // 也是约定，syscall 的编号需要放在 %rax；read 是 0
mov $0x0, %edi             // arg1: STDIN_FILENO
lea 0x0(%r13,%r12,1), %rsi // arg2: &memory[ptr]
mov $0x1, %edx             // arg3: 1  (len)
syscall
```

`write`:

```asm
mov $0x1, %eax
mov $0x1, %edi // STDOUT_FILENO
lea 0x0(%r13,%r12,1), %rsi
mov $0x1, %edx
syscall
```

### Loop

循环结构可以用 cmp 和 jump 相关指令实现：

`[`:

```asm
cmpb $0x0, 0x0(%r13,%r12,1)
// 跳到对应 ']' 后
je ...
```

`]`:

```asm
cmpb $0x0, 0x0(%r13,%r12,1)
// 跳到对应 '[' 后
jne ...
```

## 运行时生成 machine code

需要注意的是，在处理 `jump_right` (`[`) 时，写入 jump 的地址只是一个没有意义的值，只有在匹配到 `jump_left` (`]`) 时，才会去修正，因为 jump 指令的 machine code 用的是偏移量，需要在指令匹配成功后才能算出来。

```zig
try code.appendSlice(&[_]u8{
    0x41, 0x55, // push %r13
    0x49, 0x89, 0xfd, // mov %rdi,%r13
    0x41, 0x54, // push %r12
    0x45, 0x31, 0xe4, // xor %r12d,%r12d
});

for (instructions) |inst| {
    switch (inst) {
        .add => |v| {
            try code.appendSlice(&[_]u8{
                0x43, 0x80, 0x44, 0x25, 0x00, // addb ..., (%r13,%r12,1)
            });
            try code.append(v);
        },
        .move => |v| {
            if (v > 0) {
                try code.appendSlice(&[_]u8{
                    0x49, 0x81, 0xc4, // add $...,%r12
                });
                try code.appendSlice(&std.mem.toBytes(v));
            } else if (v < 0) {
                try code.appendSlice(&[_]u8{
                    0x49, 0x81, 0xec, // sub $...,%r12
                });
                try code.appendSlice(&std.mem.toBytes(-v));
            }
        },
        // write syscall
        .output => try code.appendSlice(&[_]u8{
            0xb8, 0x01, 0x00, 0x00, 0x00, // mov $0x1,%eax
            0xbf, 0x01, 0x00, 0x00, 0x00, // mov $0x1,%edi
            0x4b, 0x8d, 0x74, 0x25, 0x00, // lea 0x0(%r13,%r12,1),%rsi
            0xba, 0x01, 0x00, 0x00, 0x00, // mov $0x1,%edx
            0x0f, 0x05, // syscall
        }),
        // read syscall
        .input => try code.appendSlice(&[_]u8{
            0xb8, 0x00, 0x00, 0x00, 0x00, // mov $0x0,%eax
            0xbf, 0x00, 0x00, 0x00, 0x00, // mov $0x0,%edi
            0x4b, 0x8d, 0x74, 0x25, 0x00, // lea 0x0(%r13,%r12,1),%rsi
            0xba, 0x01, 0x00, 0x00, 0x00, // mov $0x1,%edx
            0x0f, 0x05, // syscall
        }),
        .jump_right => {
            try code.appendSlice(&[_]u8{
                0x43, 0x80, 0x7c, 0x25, 0x00, 0x00, // cmpb $0x0,0x0(%r13,%r12,1)
                0x0f, 0x84, 0x00, 0x00, 0x00, 0x00, // je ...
            });
            try jump_tbl.append(code.items.len);
        },
        .jump_left => {
            const left = jump_tbl.pop();
            try code.appendSlice(&[_]u8{
                0x43, 0x80, 0x7c, 0x25, 0x00, 0x00, // cmpb $0x0,0x0(%r13,%r12,1)
                0x0f, 0x85, 0x00, 0x00, 0x00, 0x00, // jne ...
            });
            const right = code.items.len;
            const offset: i32 = @intCast(right - left);

            @memcpy(code.items[left - 4 .. left], &std.mem.toBytes(offset));
            @memcpy(code.items[right - 4 .. right], &std.mem.toBytes(-offset));
        },
    }
}

try code.appendSlice(&[_]u8{
    0x41, 0x5c, // pop %r12
    0x41, 0x5d, // pop %r13
    0xc3, // ret
});
```

## 执行 machine code

因为操作系统对不同的内存块有不同的限制，例如可读？可写？可执行？... 一般默认的权限是可读可写，不能执行代码。

所以，生成 machine code 后，我们还需要用 `mmap` 和 `mprotect` 申请一块可用于代码执行的内存：

```zig
const mem = try os.mmap(
    null,
    aligned_len,
    os.PROT.READ | os.PROT.WRITE,
    os.MAP.PRIVATE | os.MAP.ANONYMOUS,
    -1,
    0,
);
defer os.munmap(mem);

@memcpy(mem[0..machine_code.len], machine_code);
allocator.free(machine_code);

try os.mprotect(mem, os.PROT.READ | os.PROT.EXEC);
const bf_main: *const fn (memory: [*]u8) void = @ptrCast(mem[0..machine_code.len]);

var memory = try allocator.alloc(u8, 0xffff);
defer allocator.free(memory);
@memset(memory, 0);
bf_main(memory.ptr);
```

## 最后

在 AWS Lightsail 最破的机子上跑个简单的 benchmark，和我之前用 Go 写的没任何优化的解释器相比，真的快了非常多:

```bash
$ hyperfine "./bfjit-x86_64 ./mandelbrot.bf" "./go-bf ./mandelbrot.bf"
Benchmark 1: ./bfjit-x86_64 ./mandelbrot.bf
  Time (mean ± σ):      1.623 s ±  0.087 s    [User: 1.601 s, System: 0.021 s]
  Range (min … max):    1.490 s …  1.770 s    10 runs

Benchmark 2: ./go-bf ./mandelbrot.bf
  Time (mean ± σ):     33.986 s ±  1.269 s    [User: 33.887 s, System: 0.229 s]
  Range (min … max):   32.361 s … 36.573 s    10 runs

Summary
  './bfjit-x86_64 ./mandelbrot.bf' ran
   20.94 ± 1.37 times faster than './go-bf ./mandelbrot.bf'
```

完整代码：

<https://github.com/maolonglong/bfjit-x86_64>
