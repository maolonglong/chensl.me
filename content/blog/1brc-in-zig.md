+++
title = "10 亿行挑战"
pubDate = 2024-02-22T19:44:09+08:00
draft = false
tags = ["zig"]
description = "探索使用 Zig 语言优化 10 亿行挑战的解决方案，包括 mmap、多线程、预分配等技术，最终在 M1 Pro 上实现 3.2 秒的处理速度。"
+++

前段时间外网有个很火的 [10 亿行挑战](https://github.com/gunnarmorling/1brc)，感觉挺有趣，动手试了下。其实之前八股文里就有看过，多少多少行的大文件，需要排序（最大值、最小值、平均值之类的），然后怎么拆分，怎么处理。。。

但是这个挑战，没有八股文里的限制（文件太大，无法全部装进内存等等），可以用你知道的所有优化技术

- 多线程
- 虚拟线程/coroutine
- SIMD
- Branchless
- ...

这里记录几个我能想到并实现的优化：

## mmap

正常 `read` syscall 从文件读取，需要将数据从磁盘 copy 到内核的 page cache 然后再 copy 到用户程序，用 `mmap` 能避免 `page cache -> 用户程序` 的拷贝。

## 不安全的 Number Parser

正常标准库里的浮点数解析，肯定非常复杂，但是测试数据里的数字，基本只有 `xx.x`, `x.x` 两种。可以自己写一个更简陋（更快速）的浮点数解析。

## 用整数计算代替浮点数计算

因为测试数据的小数都只有一位，所以可以乘 10 之后当做整数，能略微提高计算速度。

## 预分配

最多会有 `10_000` 个不同的气象站名称，所以可以按照这个数量级，预分配 `hash_map` 的容量，避免扩容带来的 rehash。

## 多线程计算

一般计算密集型的程序，分配和 CPU 个数一样的线程数就行，多了反而会有竞争。

## thread-local

每个线程，都只读写自己的 `Result` (存放结果的 `hash_map`)，最后再由主线程合并，避免竞争。

## 计算过程零拷贝

例如，计算时需要使用气象站的名称，可以直接引用原始数据的内存，无需重复分配。

## 最后

在我的 MacBook Pro M1 Pro (10 核) 的机子上大概只需要 3.2s

```bash
$ hyperfine --warmup 3 "./zig-out/bin/zig-1brc measurements.txt"
Benchmark 1: ./zig-out/bin/zig-1brc measurements.txt
  Time (mean ± σ):      3.328 s ±  0.025 s    [User: 26.571 s, System: 1.641 s]
  Range (min … max):    3.299 s …  3.372 s    10 runs
```

<details>
  <summary>完整代码</summary>

```zig
const std = @import("std");
const assert = std.debug.assert;
const testing = std.testing;
const Allocator = std.mem.Allocator;

pub fn main() !void {
    const argv = std.os.argv;
    if (argv.len != 2) {
        std.debug.print("Usage: {s} FILE\n", .{argv[0]});
        std.os.exit(2);
    }

    const file = try std.fs.cwd().openFileZ(argv[1], .{});
    defer file.close();
    const data = try std.os.mmap(
        null,
        try file.getEndPos(),
        std.os.PROT.READ,
        std.os.MAP.PRIVATE,
        file.handle,
        0,
    );
    defer std.os.munmap(data);

    var arena = std.heap.ArenaAllocator.init(std.heap.page_allocator);
    defer arena.deinit();
    var wrap = std.heap.ThreadSafeAllocator{ .child_allocator = arena.allocator() };
    try process(wrap.allocator(), data);
}

const Measurement = struct {
    min: i32,
    max: i32,
    sum: i32,
    count: u32 = 1,
};

const Result = std.StringHashMap(Measurement);
const pre_alloc_capacity: usize = 2 << 14;

fn process(allocator: Allocator, data: []const u8) !void {
    const chunks = try getChunks(allocator, data);
    defer allocator.free(chunks);

    var results = try std.ArrayList(Result).initCapacity(allocator, chunks.len);
    defer {
        for (results.items) |*result| {
            result.deinit();
        }
        results.deinit();
    }
    var threads = try std.ArrayList(std.Thread).initCapacity(allocator, chunks.len);
    defer threads.deinit();

    for (0..chunks.len) |idx| {
        try results.append(blk: {
            var m = Result.init(allocator);
            try m.ensureTotalCapacity(pre_alloc_capacity);
            break :blk m;
        });
        try threads.append(try std.Thread.spawn(
            .{},
            worker,
            .{
                data[(if (idx == 0) 0 else chunks[idx - 1])..chunks[idx]],
                &results.items[results.items.len - 1],
            },
        ));
    }
    for (threads.items) |thread| {
        thread.join();
    }

    var merged = Result.init(allocator);
    defer merged.deinit();
    try merged.ensureTotalCapacity(pre_alloc_capacity);
    for (results.items) |result| {
        var iter = result.iterator();
        while (iter.next()) |entry| {
            if (merged.getPtr(entry.key_ptr.*)) |m| {
                m.*.min = @min(m.*.min, entry.value_ptr.*.min);
                m.*.max = @max(m.*.max, entry.value_ptr.*.max);
                m.*.sum += entry.value_ptr.*.sum;
                m.*.count += entry.value_ptr.*.count;
            } else {
                try merged.put(entry.key_ptr.*, entry.value_ptr.*);
            }
        }
    }

    var ids = try std.ArrayList([]const u8).initCapacity(allocator, merged.count());
    defer ids.deinit();
    var iter = merged.keyIterator();
    while (iter.next()) |key| {
        try ids.append(key.*);
    }
    std.sort.pdq([]const u8, ids.items, {}, struct {
        fn lessThan(context: void, lhs: []const u8, rhs: []const u8) bool {
            _ = context;
            return std.mem.order(u8, lhs, rhs) == .lt;
        }
    }.lessThan);

    const stdout = std.io.getStdOut();
    var buf = std.io.bufferedWriter(stdout.writer());
    var writer = buf.writer();
    try writer.writeByte('{');
    for (ids.items, 0..) |id, i| {
        if (i != 0) _ = try writer.write(", ");
        const measurement = merged.get(id).?;
        try writer.print(
            "{s}={d:.1}/{d:.1}/{d:.1}",
            .{
                id,
                @as(f64, @floatFromInt(measurement.min)) / 10,
                @round(@as(f64, @floatFromInt(measurement.sum)) / @as(f64, @floatFromInt(measurement.count))) / 10,
                @as(f64, @floatFromInt(measurement.max)) / 10,
            },
        );
    }
    _ = try writer.write("}\n");
    try buf.flush();
}

fn worker(data: []const u8, result: *Result) !void {
    var offset: usize = 0;
    var semi: usize = undefined;
    var lf: usize = undefined;
    var v: i32 = undefined;
    while (true) {
        semi = std.mem.indexOfScalarPos(u8, data, offset, ';') orelse break;
        lf = semi + 1;

        v = unsafeParseNumber(data, &lf);
        if (result.getPtr(data[offset..semi])) |m| {
            m.*.min = @min(m.*.min, v);
            m.*.max = @max(m.*.max, v);
            m.*.sum += v;
            m.*.count += 1;
        } else {
            try result.put(data[offset..semi], .{
                .min = v,
                .max = v,
                .sum = v,
            });
        }

        offset = lf + 1;
    }
}

inline fn unsafeParseNumber(data: []const u8, offset: *usize) i32 {
    var sign: i32 = 1;
    var res: i32 = 0;
    if (data[offset.*] == '-') {
        sign = -1;
        offset.* += 1;
    }
    while (offset.* < data.len and data[offset.*] != '\n') : (offset.* += 1) {
        if (data[offset.*] == '.') continue;
        res = res * 10 + (data[offset.*] - '0');
    }
    return sign * res;
}

test "unsafeParseNumber" {
    var offset: usize = 0;
    try testing.expectEqual(@as(i32, 123), unsafeParseNumber("12.3", &offset));
    try testing.expectEqual(@as(usize, 4), offset);
    offset = 0;
    try testing.expectEqual(@as(i32, 12), unsafeParseNumber("1.2", &offset));
    try testing.expectEqual(@as(usize, 3), offset);
}

fn getChunks(allocator: Allocator, data: []const u8) ![]usize {
    const cpu_count = try std.Thread.getCpuCount();
    const chunk_size = data.len / cpu_count;
    assert(chunk_size > 0);

    var chunks = try std.ArrayList(usize).initCapacity(allocator, cpu_count);
    defer chunks.deinit();
    var offset: usize = 0;
    while (offset < data.len) {
        offset += chunk_size;
        if (offset >= data.len) {
            try chunks.append(data.len);
            break;
        }

        if (std.mem.indexOfScalarPos(u8, data, offset, '\n')) |idx| {
            offset = idx + 1;
        } else {
            offset = data.len;
        }
        try chunks.append(offset);
    }

    return try chunks.toOwnedSlice();
}
```

</details>

另外可能还可以用 SIMD 指令，用来索引换行符，或者特殊符号 `;`，我还没折腾。
