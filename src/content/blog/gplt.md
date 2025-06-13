---
title: GPLT团体程序设计天梯赛题解
pubDate: 2020-10-27T18:22:23+08:00
tags:
  - acm
  - cpp
toc: true
---

## 小技巧

### 万能头文件

pta 支持这个万能头，基本上所有 STL 都包含了，不用再一个一个 `include`

```cpp
#include <bits/stdc++.h>
using namespace std;
```

### 无穷大

```cpp
const int inf = 0x3f3f3f3f;
```

<!-- more -->

### max 和 min (慎用)

如果 `max`  或 `min`  函数的两个参数类型不同，就像下面的 `int`  和 `long long` ，是会报错的，这个时候加上一个宏函数就能解决。

```cpp
#include <bits/stdc++.h>
#define max(a,b) (a > b ? a : b)
using namespace std;
typedef long long ll;

int main() {
    int a = 100;
    ll b = 99;
    ll c = max(a, b);
    return 0;
}
```

### cin 还是 scanf

pta 几乎不卡时间，用 `cin`  和 `cout`  一般题目都能过。

## L1 001 ~ 010

### 001 Hello World

练手题

```python
print("Hello World!")
```

### 002 打印沙漏

可以把漏斗看成两个三角形，分开输出

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    char c;
    cin >> n >> c;
    int w = 1, h = 1;
    n -= w;
    while (n - 2 * (w + 2) >= 0) {
        w += 2;
        n -= 2 * w;
        ++h;
    }
    // cout << "h: " << h << endl;
    // cout << "n: " << n << endl;
    for (int i = 0; i < h; ++i) {
        cout << string(i, ' ') << string(w, c) << endl;
        w -= 2;
    }
    w += 4;
    for (int i = 1; i < h; ++i) {
        cout << string(h - 1 - i, ' ') << string(w, c) << endl;
        w += 2;
    }
    cout << n << endl;
    return 0;
}
```

### 003 个数位统计

直接用字符串输入，省了不必要的麻烦。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string str;
    int cnt[10] = {0};
    cin >> str;
    for (int i = 0; i < str.size(); ++i) {
        cnt[str[i] - '0']++;
    }
    for (int i = 0; i < 10; ++i) {
        if (cnt[i]) {
            cout << i << ':' << cnt[i] << endl;
        }
    }
    return 0;
}
```

### 004 计算摄氏温度

水题

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int f;
    cin >> f;
    cout << "Celsius = " << 5 * (f - 32) / 9 << endl;
    return 0;
}
```

### 005 考试座位号

题目意思说白了就是需要根据`试机座位号`找到对应的另外两个信息，注意一下数据大小，需要开到`long long`，其他还是挺好处理的。

```cpp
#include <bits/stdc++.h>
using namespace std;

typedef long long LL;
LL x, a[1005];
int n, m, y, z, b[1005];

int main() {
	cin >> n;
	for (int i = 0; i < n; ++i) {
		cin >> x >> y >> z;
		a[y] = x;
		b[y] = z;
	}
	cin >> m;
	for (int i = 0; i < m; ++i) {
		cin >> y;
		cout << a[y] << ' ' << b[y] << endl;
	}
	return 0;
}
```

### 006 连续因子

pta 一般没那么容易超时，直接暴力枚举连续因子就好。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, start = 0, len = 0;
    cin >> n;
    int k = sqrt(n);
    for (int i = 2; i <= k; ++i) {
        int temp = 1;
        for (int j = i; temp * j <= n; ++j) {
            temp *= j;
            if (n % temp) break;
            if (j - i + 1 > len) {
                len = j - i + 1;
                start = i;
            }
        }
    }
    if (!start) {
        start = n;
        len = 1;
    }
    cout << len << endl;
    cout << start;
    for (int i = 1; i < len; ++i) {
        cout << '*' << start + i;
    }
    return 0;
}
```

### 007 念数字

水题

```cpp
#include <bits/stdc++.h>
using namespace std;

string a[] = {"ling", "yi", "er", "san", "si", "wu", "liu", "qi", "ba", "jiu"};

int main() {
    string s;
    cin >> s;
    if (s[0] == '-')
        cout << "fu";
    else
        cout << a[s[0] - '0'];
    for (int i = 1; i < s.size(); ++i)
        cout << ' ' << a[s[i] - '0'];
    return 0;
}

```

### 008 求整数段和

输出格式控制还是 printf 方便些。这题有一个小坑：既是最后一个数，也是这一行的第五个数，别一次性换两行了。

```cpp
#include <bits/stdc++.h>

using namespace std;

int main() {
    int a, b, sum = 0;
    scanf("%d%d", &a, &b);
    for (int i = a; i <= b; ++i) {
        sum += i;
        printf("%5d", i);
        if ((i - a + 1) % 5 == 0)
            printf("\n");
        else if (i == b)  // 我第一次就没注意，这里的else if就写了if
            printf("\n");
    }
    printf("Sum = %d", sum);
    return 0;
}
```

### 009 N 个数求和

有点麻烦，模拟分数加法，需要通分，也就是需要找最小公倍数（欧几里得算法）

```cpp
#include <bits/stdc++.h>
typedef long long LL;
using namespace std;

LL gcd(LL a, LL b) { return b == 0 ? a : gcd(b, a % b); }

int main() {
    char c;
    int n;
    LL x, y, tmp;
    cin >> n;
    cin >> x >> c >> y;
    LL sx = x, sy = y;
    for (int i = 1; i < n; ++i) {
        cin >> x >> c >> y;
        tmp = sy / gcd(sy, y) * y;
        sx = sx * (tmp / sy) + x * (tmp / y);
        sy = tmp;
    }
    LL num = sx / sy;
    sx %= sy;
    tmp = gcd(sx, sy);
    sx /= tmp;
    sy /= tmp;
    if (sx == 0)
        cout << num;
    else if (num == 0)
        cout << sx << '/' << sy;
    else
        cout << abs(num) << ' ' << sx << '/' << sy;
    return 0;
}
```

### 010 比较大小

水题

```cpp
#include <bits/stdc++.h>

using namespace std;

int main()
{
	int a[3];
    for (int i = 0; i < 3; ++i)
        cin >> a[i];
    sort(a, a + 3);
    cout << a[0] << "->" << a[1] << "->" << a[2];
	return 0;
}
```

## L1 011 ~ 020

### 011 A-B

判断 a 中某个字符是否在 b 中出现过（判断 xxx 是否出现，基本上就是用 set），否的话输出。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string a, b;
    getline(cin, a);
    getline(cin, b);
    set<char> st;
    for (auto &c : b) {
        st.insert(c);
    }
    for (auto &c : a) {
        if (st.find(c) == st.end()) {
            cout << c;
        }
    }
    return 0;
}
```

### 012 计算指数

别想复杂了，这是 L1，所以直接`pow`就好，没必要写个快速幂。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
	int n;
	cin >> n;
	cout << "2^" << n << " = " << pow(2, n);
	return 0;
}
```

### 013 计算阶乘和

同理，这是 L1，需要啥记忆化搜索或者 dp 嘛。

```cpp
#include <bits/stdc++.h>

using namespace std;

int fac(int x) { return x == 1 ? 1 : fac(x - 1) * x; }

int main() {
	int n, sum = 0;
	cin >> n;
	for (int i = 1; i <= n; ++i)
		sum += fac(i);
	cout << sum;
	return 0;
}
```

### 014 简单题

这里顺便提一个技巧，天梯赛就 3 小时，每一秒都挺宝贵的，这种简单题（能一行代码解决的），在网页里直接敲个 python，性价比最高。

```python
print('This is a simple problem.')
```

### 015 和奥巴马一起画方块

有点坑就是计算行数的时候需要四舍五入（c++的 round 函数）

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
	int n;
	char c;
	cin >> n >> c;
	int m = round(n * 1.0 / 2);
	for (int i = 0; i < m; ++i) {
		cout << string(n, c) << endl;
	}
	return 0;
}
```

### 016 查验身份证

水题

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
	int a[] = {7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2};
	int b[] = {'1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2'};
	int n;
	cin >> n;
	string s;
	bool flag = false;
	while (n--) {
		int sum = 0;
		cin >> s;
		for (int i = 0; i < s.size() - 1; ++i)
			sum += (s[i] - '0') * a[i];
		sum %= 11;
		if (b[sum] != s.back()) {
			cout << s << endl;
			flag = true;
		}
	}
	if (!flag)
		cout << "All passed";
	return 0;
}
```

### 017 到底有多二

注意题目的输入是一个不超过 50 位的数（50 位，50 位，50 位）所以只能用字符串去做。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string s;
    cin >> s;
    int cnt = 0;
    double flag = 1;
    if (s[0] == '-') {
        flag *= 1.5;
        s.erase(s.begin(), s.begin() + 1);
    }
    if ((s.back() - '0') % 2 == 0) flag *= 2;
    for (int i = 0; i < s.size(); ++i)
        if (s[i] == '2') ++cnt;
    cout << fixed << setprecision(2)
         << cnt * flag / s.size() * 100 << '%';
    return 0;
}
```

### 018 大笨钟

注意输出要保留 0

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int h, m;
    scanf("%d:%d", &h, &m);
    if (h >= 0 && h < 12 || h == 12 && m == 0)
        printf("Only %02d:%02d.  Too early to Dang.", h, m);
    else {
        if (m == 0)
            h -= 12;
        else
            h -= 11;
        while (h--)
            printf("Dang");
    }
    return 0;
}
```

### 019 谁先倒

思路：谁输了就把谁的酒量减 1，最后谁的酒量变成负数，也就是谁倒了。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m, t, a, b, c, d;
    int cnt1 = 0, cnt2 = 0;
    cin >> n >> m >> t;
    while (n >= 0 && m >= 0) {
        cin >> a >> b >> c >> d;
        int tmp = a + c;
        if (b == tmp && d != tmp) {
            --n;
            ++cnt1;
        } else if (b != tmp && d == tmp) {
            --m;
            ++cnt2;
        }
    }
    if (n < 0)
        cout << "A\n" << cnt2;
    else
        cout << "B\n" << cnt1;
    return 0;
}
```

### 020 帅到没朋友

别一看完题目就想到并查集，这题还用不上。（其实这题就是水题，别想复杂了）
思路：如果一个朋友圈人数超过一个人，也就代表着这些人都是“有朋友”的，用数组标记一下。相反，如果朋友圈就一个人（孤身一人的朋友圈。。。）就不用给标记。最后就是注意一下：**同一个人可以被查询多次，但只输出一次。**

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, k, id;
    vector<bool> fri(100000), vis(100000);
    cin >> n;
    while (n--) {
        cin >> k;
        if (k == 1)
            cin >> id;
        else {
            while (k--) {
                cin >> id;
                fri[id] = 1;
            }
        }
    }
    cin >> n;
    bool flag = false;
    while (n--) {
        cin >> id;
        if (!fri[id] && !vis[id]) {
            if (flag) cout << ' ';
            printf("%05d", id);  // 记得保留0
            vis[id] = flag = 1;
        }
    }
    if (!flag) cout << "No one is handsome";
    return 0;
}
```

## L1 021 ~ 030

### 021 重要的话说三遍

py 速度做

```python
for i in range(3):
    print("I'm gonna WIN!")
```

### 022 奇偶分家

顺便提一下 `x & 1`  可以用来判断奇数，应该是会比 `x % 2`  快一点

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, x, a = 0, b = 0;
    cin >> n;
    while (n--) {
        cin >> x;
        if (x & 1)
            ++a;
        else
            ++b;
    }
    cout << a << ' ' << b;
    return 0;
}
```

### 023 输出 GPLT

水题

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string str;
    cin >> str;
    int g = 0, p = 0, l = 0, t = 0;
    for (int i = 0; i < str.size(); ++i) {
        if (str[i] == 'g' || str[i] == 'G')
            ++g;
        else if (str[i] == 'p' || str[i] == 'P')
            ++p;
        else if (str[i] == 'l' || str[i] == 'L')
            ++l;
        else if (str[i] == 't' || str[i] == 'T')
            ++t;
    }
    while (g || p || l || t) {
        if (g) {
            cout << 'G';
            --g;
        }
        if (p) {
            cout << 'P';
            --p;
        }
        if (l) {
            cout << 'L';
            --l;
        }
        if (t) {
            cout << 'T';
            --t;
        }
    }
    return 0;
}
```

### 024 后天

水题

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int d;
    cin >> d;
    cout << (d + 1) % 7 + 1;
    return 0;
}
```

### 025 正整数 A+B

比较基础的字符串处理，用了 `find`  查找，和 `substr`  切割字符串。

```cpp
#include <bits/stdc++.h>
using namespace std;

int getNum(string &s) {
    int num = 0;
    for (int i = 0; i < s.size(); ++i) {
        if (s[i] < '0' || s[i] > '9')
            return -1;
        num = num * 10 + s[i] - '0';
    }
    return (num >= 1 && num <= 1000) ? num : -1;
}

int main() {
    string line, s1, s2;
    getline(cin, line);
    int space = line.find(' ');
    s1 = line.substr(0, space);
    s2 = line.substr(space + 1);
    int n1 = getNum(s1), n2 = getNum(s2);
    if (n1 != -1)
        cout << n1 << " + ";
    else
        cout << "? + ";
    if (n2 != -1)
        cout << n2 << " = ";
    else
        cout << "? = ";
    if (n1 != -1 && n2 != -1)
        cout << n1 + n2;
    else
        cout << '?';
    return 0;
}
```

### 026 I Love GPLT

同样，py。但是注意：**输出的两个空行中各有一个空格**。

```python
print("""I

L
o
v
e

G
P
L
T""")
```

### 027 出租

天梯赛最爱的恶心字符串处理

```cpp
#include <bits/stdc++.h>
using namespace std;

string tel;
bool vis[10];
vector<int> v1, v2;
map<int, int> mp;

int main() {
    cin >> tel;
    for (int i = 0; i < tel.size(); ++i) vis[tel[i] - '0'] = true;
    for (int i = 9; i >= 0; --i) {
        if (vis[i]) {
            mp[i] = v1.size();
            v1.push_back(i);
        }
    }
    for (int i = 0; i < tel.size(); ++i) v2.push_back(mp[tel[i] - '0']);
    cout << "int[] arr = new int[]{";
    for (int i = 0; i < v1.size(); ++i) {
        cout << v1[i];
        if (i != v1.size() - 1) cout << ',';
    }
    cout << "};\nint[] index = new int[]{";
    for (int i = 0; i < v2.size(); ++i) {
        cout << v2[i];
        if (i != v2.size() - 1) cout << ',';
    }
    cout << "};";
    return 0;
}
```

### 028 判断素数

```cpp
#include <bits/stdc++.h>
using namespace std;

bool is_prime(int x) {
    if (x < 2) return 0;
    for (int i = 2; i <= sqrt(x); ++i)
        if (x % i == 0) return false;
    return 1;
}

int main() {
    int n, x;
    cin >> n;
    while (n--) {
        cin >> x;
        if (is_prime(x))
            cout << "Yes" << endl;
        else
            cout << "No" << endl;
    }
    return 0;
}
```

### 029 是不是太胖了

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int h;
    scanf("%d", &h);
    printf("%.1f\n", (1.0 * h - 100) * 0.9 * 2);
    return 0;
}
```

### 030 一帮一

双指针法

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, sex, p0, p1;
    string name;
    cin >> n;
    vector<pair<int, string>> students(n);
    for (int i = 0; i < n; ++i) {
        cin >> sex >> name;
        students[i] = make_pair(sex, name);
    }
    p0 = p1 = n - 1;  // 双指针法, 分别指向最后一名的女生和男生
    // 因为题目说，保证男女1:1，所以直接可以分成n/2组
    for (int i = 0; i < n / 2; ++i) {
        if (students[i].first == 1) {
            while (students[p0].first == 1) --p0;
            cout << students[i].second << ' ' << students[p0--].second << endl;
        } else {
            while (students[p1].first == 0) --p1;
            cout << students[i].second << ' ' << students[p1--].second << endl;
        }
    }
    return 0;
}
```

## L1 031 ~ 040

### 031 到底是不是太胖了

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, h, w;
    float x;
    cin >> n;
    while (n--) {
        cin >> h >> w;
        x = (h - 100) * 0.9 * 2;
        cout << "You are ";
        if (fabs(x - w) < x * 0.1) {
            cout << "wan mei!";
        } else {
            if (w > x)
                cout << "tai pang le!";
            else
                cout << "tai shou le!";
        }
        cout << endl;
    }
    return 0;
}
```

### 032 Left-pad

用 `getline`  读入一行前要注意有没有回车需要“处理掉”

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    char c;
    string s;
    cin >> n >> c;
    cin.get();  // 处理回车
    getline(cin, s);
    if (n == s.size()) {
        cout << s;
    } else if (n < s.size()) {
        cout << s.substr(s.size() - n);
    } else {
        int m = n - s.size();
        string prefix(m, c);
        cout << prefix + s;
    }
    return 0;
}
```

### 033 出生年

尤其注意位数不足 4 位的年

```cpp
#include <bits/stdc++.h>
using namespace std;

int year, n, age = 0;
set<int> s;

bool valid(int year) {
    s.clear();
    if (year < 1000) s.insert(0);  // 位数不足4位，特殊考虑
    while (year) {
        s.insert(year % 10);
        year /= 10;
    }
    return s.size() == n;
}

int main() {
    scanf("%d%d", &year, &n);
    while (1) {
        if (valid(year)) {
            printf("%d %04d", age, year);  // 不足4位需要保留前导零
            break;
        }
        ++year;
        ++age;
    }
    return 0;
}
```

### 034 点赞

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, k, x;
    vector<int> v(1005, 0);
    cin >> n;
    while (n--) {
        cin >> k;
        while (k--) {
            cin >> x;
            ++v[x];
        }
    }
    int res, cnt = INT_MIN;
    for (int i = 0; i < 1005; ++i) {
        if (v[i] >= cnt) {
            cnt = v[i];
            res = i;
        }
    }
    cout << res << ' ' << cnt << endl;
    return 0;
}
```

### 035 情人节

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string s, a, b;
    int cnt = 0;
    while (cin >> s && s != ".") {
        ++cnt;
        if (cnt == 2) a = s;
        if (cnt == 14) b = s;
    }
    if (cnt >= 14)
        cout << a << " and " << b << " are inviting you to dinner..." << endl;
    else if (cnt >= 2)
        cout << a << " is the only one for you..." << endl;
    else
        cout << "Momo... No one is for you ..." << endl;
    return 0;
}
```

### 036 A 乘以 B

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a * b;
    return 0;
}
```

### 036 A 除以 B

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a, b;
    cin >> a >> b;
    cout << a << '/';
    if (b < 0) cout << '(';
    cout << b;
    if (b < 0) cout << ')';
    cout << '=';
    if (b == 0)
        cout << "Error";
    else
        printf("%.2f", 1.0 * a / b);
    return 0;
}
```

### 038 新世界

```python
print("""Hello World
Hello New World""")
```

### 039 古风排版

这种题目思路很多种，我是把一行字符串先读入，然后每 n 个放进 vector，最后旋转 90° 输出 vector

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, m;
    cin >> n;
    cin.get();
    string line;
    getline(cin, line);
    m = ceil(1.0 * line.size() / n);
    vector<string> ans;
    for (int i = 0; i < m; ++i) {
        ans.push_back(line.substr(i * n, n));
    }
    for (int j = 0; j < n; ++j) {
        for (int i = ans.size() - 1; i >= 0; --i) {
            if (j < ans[i].size())
                cout << ans[i][j];
            else
                cout << ' ';
        }
        cout << endl;
    }
    // system("pause");
    return 0;
}
```

### 040 最佳情侣身高差

```cpp
#include <bits/stdc++.h>

using namespace std;

int main()
{
    int N;
    double height;
    char sex;
    cin >> N;
    while (N--)
    {
        cin >> sex >> height;
        if (sex == 'M')
            printf("%.2f", height / 1.09);
        else
            printf("%.2f", height * 1.09);
        cout << endl;
    }
    return 0;
}
```

## L1 041 ~ 050

### 041 寻找 250

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int x, idx = 0;
    bool flag = 0;
    while (cin >> x) {
        ++idx;
        if (x == 250 && !flag) {
            cout << idx;
            flag = 1;
        }
    }
    return 0;
}
```

刚好看到了自己**去年**做这道题写的代码，简直就是 250：

```cpp
#include <iostream>
#include <string>

using namespace std;

int main()
{
    string str;
    getline(cin, str);
    int sum(0), temp(1), index(0), str_size(str.size()), first(0);
    for (int i = 0; i < str_size; ++i)
    {
        if (str[i] == ' ')
        {
            index++;
            if (sum * temp == 250)
            {
                first = index;
                break;
            }
            else
            {
                sum = 0;
                temp = 1;
            }
        }
        else if (str[i] == '-')
            temp = -1;
        else
            sum = sum * 10 + (str[i] - '0');
    }
    if (first == 0)
        first = index + 1;
    cout << first;
    return 0;
}
```

### 042 日期格式化

```cpp
#include <stdio.h>

int main()
{
    int y, m, d;
    scanf("%d-%d-%d", &m, &d, &y);
    printf("%04d-%02d-%02d", y, m, d);
    return 0;
}
```

### 043 阅览室

题目比较坑，如果重复借同一本书，是按照最后一次的时间算。

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, id, h, m, sum, cnt, book[1005];
    char op;
    scanf("%d", &n);
    while (n--) {
        sum = cnt = 0;
        memset(book, -1, sizeof(book));
        while (scanf("%d %c %d:%d", &id, &op, &h, &m) && id) {
            if (op == 'S') {
                book[id] = h * 60 + m;
            } else if (book[id] != -1) {
                sum += h * 60 + m - book[id];
                book[id] = -1;
                ++cnt;
            }
        }
        printf("%d %.0lf\n", cnt, cnt ? round(1.0 * sum / cnt) : 0);
    }
    return 0;
}
```

### 044 稳赢

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int k, idx = 0;
    cin >> k;
    string str;
    while (cin >> str && str != "End") {
        if (idx == k) {
            cout << str << endl;
            idx = 0;
        } else {
            ++idx;
            if (str == "ChuiZi") cout << "Bu" << endl;
            else if (str == "JianDao") cout << "ChuiZi" << endl;
            else cout << "JianDao" << endl;
        }
    }
    return 0;
}
```

### 045 宇宙无敌大招呼

```python
name = input()
print("Hello", name)
```

### 046 整除光棍

既然题目都描述了 `s`  是一个非常大的数，那就应该想到大数运算，题目要求就是需要找到一个 111111...... 能够被 `x`  整除，也就是下面的计算，用代码模拟这个过程就好了。
![image.png](https://cdn.nlark.com/yuque/0/2020/png/2775391/1604481489143-5fd47ee0-0886-4e3d-b99a-fa7eddbbdcec.png#align=left&display=inline&height=577&margin=%5Bobject%20Object%5D&name=image.png&originHeight=1153&originWidth=2246&size=158175&status=done&style=none&width=1123)

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int x, s = 0, len = 0;
    cin >> x;
    while (s < x) {
        s = s * 10 + 1;
        ++len;
    }
    cout << s / x;
    s %= x;
    while (s) {
        s = s * 10 + 1;
        ++len;
        cout << s / x;
        s %= x;
    }
    cout << ' ' << len;
    return 0;
}
```

### 047 装睡

```cpp
#include <bits/stdc++.h>
using namespace std;

int main()
{
    string name;
    int N, bre, pul;
    cin >> N;
    while (N--)
    {
        cin >> name >> bre >> pul;
        if (bre < 15 || bre > 20 || pul < 50 || pul > 70)
            cout << name << endl;
    }
    return 0;
}
```

### 048 矩阵 A 乘以 B

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int a[100][100], b[100][100];
    int ra, ca, rb, cb;
    cin >> ra >> ca;
    for (int i = 0; i < ra; ++i) {
        for (int j = 0; j < ca; ++j) {
            cin >> a[i][j];
        }
    }
    cin >> rb >> cb;
    for (int i = 0; i < rb; ++i) {
        for (int j = 0; j < cb; ++j) {
            cin >> b[i][j];
        }
    }
    if (ca != rb) {
        cout << "Error: " << ca << " != " << rb << endl;
        return 0;
    }
    cout << ra << ' ' << cb << endl;
    for (int i = 0; i < ra; ++i) {
        for (int j = 0; j < cb; ++j) {
            int sum = 0;
            for (int k = 0;  k < ca; ++k) {
                sum += a[i][k] * b[k][j];
            }
            cout << sum;
            if (j + 1 != cb) cout << ' ';
        }
        cout << endl;
    }
    return 0;
}
```

### 049 天梯赛座位分配

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, team[100], num[100], ok = 0, idx = 1;
    bool vis[100];
    cin >> n;
    vector<vector<int>> ans(n);
    for (int i = 0; i < n; ++i) {
        cin >> team[i];
        num[i] = 10 * team[i];
    }
    while (ok < n) {
        for (int i = 0; i < n; ++i) {
            if (num[i] == 0) continue;
            ans[i].push_back(idx++);
            --num[i];
            if (ok + 1 == n) idx++;
            if (!vis[i] && num[i] == 0) {
                vis[i] = 1;
                ++ok;
            }
        }
    }
    for (int i = 0; i < n; ++i) {
        cout << "#" << i + 1 << endl;
        for (int j = 0; j < ans[i].size(); ++j) {
            cout << ans[i][j];
            if ((j + 1) % 10 == 0)
                cout << endl;
            else
                cout << ' ';
        }
    }
    return 0;
}
```

### 050 倒数第 N 个字符串

26 进制

```cpp
#include <iostream>
#include <cmath>
#include <stack>
using namespace std;

int main()
{
    int L, N, M;
    stack<int> sta;
    cin >> L >> N;
    M = pow(26, L) - N;
    for (int i = 0; i < L; ++i)
    {
        sta.push(M % 26);
        M /= 26;
    }
    while (!sta.empty())
    {
        cout << (char)('a' + sta.top());
        sta.pop();
    }
    return 0;
}
```

## L1 051 ~ 060

### 051 打折

```c
#include <stdio.h>

int main()
{
  int a, b;
  scanf("%d %d", &a, &b);
  printf("%.2f", a * 0.1 * b);
  return 0;
}
```

### 052 2018 我们要赢

```python
print("""2018
wo3 men2 yao4 ying2 !""")
```

### 053 电子汪

```cpp
#include <iostream>
using namespace std;

int main()
{
  int A, B;
  cin >> A >> B;
  A += B;
  while (A--)
    cout << "Wang!";
  return 0;
}
```

### 054 福到了

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    char ch, a[100][100];
    int n;
    cin >> ch >> n;
    for (int i = 0; i < n; ++i) {
        cin.get();  // 吃空格
        for (int j = 0; j < n; ++j) {
            cin.get(a[i][j]);
        }
    }
    bool flag = false;
    for (int i = 0; i < n / 2; ++i) {
        for (int j = 0; j < n / 2; ++j) {
            if (a[i][j] != a[n - 1 - i][n - 1 - j]) {
                flag = true;
                break;
            }
        }
    }
    if (!flag)
        cout << "bu yong dao le" << endl;
    for (int i = n - 1; i >= 0; --i) {
        for (int j = n - 1; j >= 0; --j) {
            if (a[i][j] != ' ')
                cout << ch;
            else
                cout << ' ';
        }

        cout << endl;
    }
    return 0;
}
```

### 055 谁是赢家

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int pa, pb, x, ja = 0, jb = 0;
    cin >> pa >> pb;
    for (int i = 0; i < 3; ++i) {
        cin >> x;
        if (x == 0)
            ++ja;
        else
            ++jb;
    }
    cout << "The winner is ";
    if (pa > pb && ja != 0 || ja == 3)
        cout << "a: " << pa << " + " << ja;
    else
        cout << "b: " << pb << " + " << jb;
    return 0;
}
```

### 056 猜数字

```cpp
#include <bits/stdc++.h>
using namespace std;
using psi = pair<string, int>;

int main() {
    string name;
    int n, num, sum;
    cin >> n;
    vector<psi> v(n);
    for (int i = 0; i < n; ++i) {
        cin >> name >> num;
        sum += num;
        v[i] = make_pair(name, num);
    }
    sum = sum / n / 2;
    int mi = abs(sum - v[0].second);
    name = v[0].first;
    for (int i = 1; i < n; ++i) {
        if (abs(sum - v[i].second) < mi) {
            mi = abs(sum - v[i].second);
            name = v[i].first;
        }
    }
    cout << sum << ' ' << name;
    return 0;
}
```

### 057 PTA 使我精神焕发

```python
print('PTA shi3 wo3 jing1 shen2 huan4 fa1 !')
```

### 058 6 翻了

C++ 的正则表达式我下次讲讲

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    string line, s;
    regex e1("6{4,}"), e2("6{10,}");
    getline(cin, line);
    s = regex_replace(line, e2, "27");
    s = regex_replace(s, e1, "9");
    cout << s << endl;
    return 0;
}
```

### 059 敲笨钟

正则表达式

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n;
    string s;
    cin >> n;
    cin.get();
    while (n--) {
        getline(cin, s);
        if (regex_match(s, regex(".*?ong,.*?ong\\.")))
            cout << regex_replace(s, regex("(\\s\\w+){3}\\."), " qiao ben zhong.") << endl;
        else
            cout << "Skipped" << endl;
    }
    return 0;
}
```

### 060 心理阴影面积

直接做减法，或者用叉积

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int x, y;
    cin >> x >> y;
    cout << abs((100 * x) - (100 * y)) / 2 << endl;
    return 0;
}
```

## L1 061 ~ 064

### 061 新胖子公式

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    double n, m, ans;
    cin >> n >> m;
    ans = n / (m * m);
    printf("%.1lf\n", ans);
    if (ans > 25)
        cout << "PANG";
    else
        cout << "Hai Xing";
    return 0;
}
```

### 062 幸运彩票

```cpp
#include <iostream>
using namespace std;

int main() {
    int n, l, r;
    string s;
    cin >> n;
    while (n--) {
        cin >> s;
        l = r = 0;
        for (int i = 0; i < 3; ++i) {
            l += s[i] - '0';
            r += s[i + 3] - '0';
        }
        if (l == r)
            cout << "You are lucky!\n";
        else
            cout << "Wish you good luck.\n";
    }
    return 0;
}
```

### 063 吃鱼还是吃肉

```cpp
#include <bits/stdc++.h>
using namespace std;

int main() {
    int n, x, y, z;
    cin >> n;
    while (n--) {
        cin >> x >> y >> z;
        if (x == 1) {
            if (y < 130)
                cout << "duo chi yu! ";
            else if (y == 130)
                cout << "wan mei! ";
            else
                cout << "ni li hai! ";
            if (z < 27)
                cout << "duo chi rou!\n";
            else if (z == 27)
                cout << "wan mei!\n";
            else
                cout << "shao chi rou!\n";
        } else {
            if (y < 129)
                cout << "duo chi yu! ";
            else if (y == 129)
                cout << "wan mei! ";
            else
                cout << "ni li hai! ";
            if (z < 25)
                cout << "duo chi rou!\n";
            else if (z == 25)
                cout << "wan mei!\n";
            else
                cout << "shao chi rou!\n";
        }
    }
    return 0;
}
```

### 064 估值一亿的 AI 核心代码

正则表达式。去年参加天梯赛遇到这题，那时候还不会正则表达式，直接当成字符串处理的话又太浪费时间，所以就没做，这题得有 L2 难度了。（真的恶心 🤢）

```cpp
#include <bits/stdc++.h>
using namespace std;

string trim(string str) {
    int first = str.find_first_not_of(' ');
    if (first == string::npos) {
        return "";
    }
    int last = str.find_last_not_of(' ');
    return str.substr(first, last - first + 1);
}

int main() {
    int n;
    string line, s;
    cin >> n;
    cin.get();
    while (n--) {
        getline(cin, line);
        cout << line << endl;
        s = trim(line);
        if (s.empty()) {
            cout << "AI: " << endl;
            continue;
        }
        for (int i = 0; i< s.size(); ++i) {
            if (s[i] >= 'A' && s[i] <= 'Z' && s[i] != 'I') {
                s[i] += 32;
            }
        }
        s = regex_replace(s, regex("\\s+"), " ");
        s = regex_replace(s, regex("\\s(\\W)"), "$1");
        s = regex_replace(s, regex("\\bcan you\\b"), "A");
        s = regex_replace(s, regex("\\bcould you\\b"), "B");
        s = regex_replace(s, regex("\\b(I|me)\\b"), "C");
        s = regex_replace(s, regex("\\?"), "!");
        s = regex_replace(s, regex("A"), "I can");
        s = regex_replace(s, regex("B"), "I could");
        s = regex_replace(s, regex("C"), "you");
        cout << "AI: " << s << endl;
    }
    return 0;
}
```

## L2 001 ~ 010

### 001 紧急救援

稍微复杂一点的 dijkstra
数组分别代表的含义：

- path: 道路长度
- num: 该城市的救援队数目
- vis: 是否被访问
- dis: 到达该点的最短路长度
- cnt: 到达该点的最短路条数
- sum: 当的救援队总数目
- pre: 最短路的前驱节点

```cpp
#include <bits/stdc++.h>
using namespace std;
const int inf = 0x3f3f3f3f;
const int maxn = 505;
typedef pair<int, int> pii;

int n, m, s, d, u, v, w, idx;
int path[maxn][maxn], num[maxn], vis[maxn], dis[maxn], cnt[maxn], sum[maxn], pre[maxn];

void init() {
    memset(dis, 0x3f, sizeof(dis));
    memset(path, 0x3f, sizeof(path));
    memset(vis, 0, sizeof(vis));
    memset(cnt, 0, sizeof(cnt));
    memset(sum, 0, sizeof(sum));
    memset(pre, -1, sizeof(pre));
}

void dijkstra() {
    priority_queue<pii, vector<pii>, greater<pii>> que;
    dis[s] = 0;
    cnt[s] = 1;
    sum[s] = num[s];
    que.push(make_pair(0, s));
    while (!que.empty()) {
        int u = que.top().second;
        que.pop();
        if (vis[u]) continue;
        vis[u] = 1;
        for (int i = 0; i < n; ++i) {
            if (!vis[i] && path[u][i] != inf) {
                int _dis = dis[u] + path[u][i];
                int _sum = sum[u] + num[i];
                if (_dis < dis[i]) {
                    dis[i] = _dis;
                    sum[i] = _sum;
                    cnt[i] = cnt[u];
                    pre[i] = u;
                    que.push(make_pair(dis[i], i));
                } else if (_dis == dis[i]) {
                    cnt[i] += cnt[u];
                    if (_sum > sum[i]) {
                        sum[i] = _sum;
                        pre[i] = u;
                    }
                }
            }
        }
    }
    printf("%d %d\n", cnt[d], sum[d]);
    stack<int> stk;
    int u = d;
    while (u != -1) {
        stk.push(u);
        u = pre[u];
    }
    bool flag = 0;
    while (!stk.empty()) {
        if (flag) putchar(' ');
        printf("%d", stk.top());
        stk.pop();
        flag = 1;
    }
}

int main() {
    init();
    scanf("%d%d%d%d", &n, &m, &s, &d);
    for (int i = 0; i < n; ++i) {
        scanf("%d", num + i);
    }
    for (int i = 0; i < m; ++i) {
        scanf("%d%d%d", &u, &v, &w);
        path[u][v] = path[v][u] = w;
    }
    dijkstra();
    return 0;
}
```

### 002 链表去重

虽然题目是叫链表去重，但是真的乖乖按照数据结构课上的方法去做肯定超时，重复的节点别真去删除，标记一下就行了。

```cpp
#include <bits/stdc++.h>
using namespace std;

struct Node {
    int data, next;
};

int head, n, a, b, c;
vector<Node> node(100005);
vector<bool> vis(10005);
queue<int> q1, q2;

int main() {
    scanf("%d%d", &head, &n);
    while (n--) {
        scanf("%d%d%d", &a, &b, &c);
        node[a].data = b;
        node[a].next = c;
    }
    for (int i = head; i != -1; i = node[i].next) {
        if (!vis[abs(node[i].data)]) {
            vis[abs(node[i].data)] = true;
            q1.push(i);
        } else
            q2.push(i);
    }
    int pos = q1.front();
    q1.pop();
    printf("%05d %d ", pos, node[pos].data);
    while (!q1.empty()) {
        pos = q1.front();
        q1.pop();
        printf("%05d\n%05d %d ", pos, pos, node[pos].data);
    }
    printf("-1\n");
    if (!q2.empty()) {
        pos = q2.front();
        q2.pop();
        printf("%05d %d ", pos, node[pos].data);
        while (!q2.empty()) {
            pos = q2.front();
            q2.pop();
            printf("%05d\n%05d %d ", pos, pos, node[pos].data);
        }
        printf("-1");
    }
    return 0;
}
```

### 003 月饼

对平均价格（总价/库存）进行贪心

```cpp
#include <bits/stdc++.h>
using namespace std;

struct Node {
    double x, y, z;
    bool operator<(const Node &node) const { return z > node.z; }
} a[1005];

int n;
double d;

int main() {
    cin >> n >> d;
    for (int i = 0; i < n; ++i) cin >> a[i].x;
    for (int i = 0; i < n; ++i) {
        cin >> a[i].y;
        a[i].z = a[i].y / a[i].x;
    }
    sort(a, a + n);
    double sum = 0;
    for (int i = 0; i < n; ++i) {
        if (d >= a[i].x) {
            d -= a[i].x;
            sum += a[i].y;
        } else {
            sum += d * a[i].z;
            break;
        }
    }
    cout << fixed << setprecision(2) << sum;
    return 0;
}
```

### 004 这是二叉搜索树吗

按照二叉搜索树的性质建树，先试试是不是二叉搜索树，再试试是不是二叉搜索树的 “镜像”，如果最后能建成就顺便输出后序遍历。

```cpp
#include <bits/stdc++.h>

using namespace std;

int n, pre[1005], post[1005], cnt = 0;
bool flag;

void build(int l, int r) {
    if (l > r) return;
    int i = l + 1, j = r;
    if (!flag) {
        while (i <= r && pre[i] < pre[l]) ++i;
        while (l < j && pre[j] >= pre[l]) --j;
    } else {
        while (i <= r && pre[i] >= pre[l]) ++i;
        while (l < j && pre[j] < pre[l]) --j;
    }
    if (i - j != 1) return;
    build(l + 1, j);
    build(i, r);
    post[cnt++] = pre[l];
}

int main() {
    scanf("%d", &n);
    for (int i = 0; i < n; ++i) scanf("%d", &pre[i]);
    build(0, n - 1);
    if (cnt != n) {
        flag = true;
        cnt = 0;
        build(0, n - 1);
    }
    if (cnt != n)
        printf("NO\n");
    else {
        printf("YES\n");
        printf("%d", post[0]);
        for (int i = 1; i < cnt; ++i) printf(" %d", post[i]);
        printf("\n");
    }
    return 0;
}
```

### 005 集合相似度

读题好累。。。

```cpp
#include <bits/stdc++.h>

using namespace std;

vector<set<int>> vct;
int n, m, x, k, a, b, cnt;

int main() {
    scanf("%d", &n);
    vct.resize(n + 1);
    for (int i = 1; i <= n; ++i) {
        scanf("%d", &m);
        for (int j = 0; j < m; ++j) {
            scanf("%d", &x);
            vct[i].insert(x);
        }
    }
    scanf("%d", &k);
    while (k--) {
        cnt = 0;
        scanf("%d%d", &a, &b);
        for (auto i : vct[a])
            if (vct[b].find(i) != vct[b].end())
                ++cnt;
        printf("%.2lf%%\n", cnt * 100.0 / (vct[a].size() + vct[b].size() - cnt));
    }
    return 0;
}
```

### 006 树的遍历

数据结构基本功

```cpp
#include <bits/stdc++.h>
using namespace std;

int post[40], in[40];

struct TreeNode {
    int left, right;
} tree[40];

int build(int in_l, int in_r, int post_l, int post_r) {
    if (in_l > in_r || post_l > post_r) return 0;
    int root = post[post_r];
    int p = in_l;
    while (in[p] != root) ++p;
    tree[root].left = build(in_l, p - 1, post_l, post_l + p - in_l - 1);
    tree[root].right = build(p + 1, in_r, post_l + p - in_l, post_r - 1);
    return root;
}

void level_order(int root) {
    queue<int> q;
    q.push(root);
    bool flag = 0;
    while (!q.empty()) {
        int v = q.front();
        q.pop();
        if (flag) cout << ' ';
        cout << v;
        flag = 1;
        if (tree[v].left) q.push(tree[v].left);
        if (tree[v].right) q.push(tree[v].right);
    }
}

int main() {
    int n;
    cin >> n;
    for (int i = 0; i < n; ++i) cin >> post[i];
    for (int i = 0; i < n; ++i) cin >> in[i];
    int root = build(0, n - 1, 0, n - 1);
    level_order(root);
    return 0;
}
```

### 007 家庭房产

并查集，这题其实不难，但是真的恶心哎。

```cpp
#include <bits/stdc++.h>
using namespace std;
const int maxn = 10005;

int n, id, f, m, k, c, cnt;
int pre[maxn], pc[maxn], hc[maxn], h[maxn];
bool vis[maxn];

struct Ans {
    double hc, h;
    int id, cnt;
} ans[maxn];

int find(int x) { return x == pre[x] ? x : pre[x] = find(pre[x]); }

void merge(int x, int y) {
    int f1 = find(x), f2 = find(y);
    // 保证父节点比子节点小
    if (f1 < f2) pre[f2] = f1;
    if (f2 < f1) pre[f1] = f2;
}

int main() {
    for (int i = 0; i < maxn; ++i) {
        pre[i] = i;
    }
    cin >> n;
    while (n--) {
        cin >> id >> f >> m >> k;
        vis[id] = 1;
        if (f != -1) {
            vis[f] = 1;
            merge(id, f);
        }
        if (m != -1) {
            vis[m] = 1;
            merge(id, m);
        }
        while (k--) {
            cin >> c;
            vis[c] = 1;
            merge(id, c);
        }
        cin >> hc[id] >> h[id];
    }
    for (int i = 0; i < maxn; ++i) {
        if (vis[i]) {
            id = find(i);
            ans[id].id = id;
            ans[id].hc += hc[i];
            ans[id].h += h[i];
            ++ans[id].cnt;
        }
    }
    for (int i = 0; i < maxn; ++i) {
        if (ans[i].cnt) {
            ++cnt;  // 标记一共有几个家庭
            ans[i].hc /= ans[i].cnt;
            ans[i].h /= ans[i].cnt;
        }
    }
    sort(ans, ans + maxn, [](Ans x, Ans y) {
        if (x.h == y.h) {
            return x.id < y.id;
        }
        return x.h > y.h;
    });
    cout << cnt << endl;
    for (int i = 0; i < cnt; ++i) {
        printf("%04d %d %.3f %.3f\n", ans[i].id, ans[i].cnt, ans[i].hc, ans[i].h);
    }
    return 0;
}
```

### 008 最长对称字串

马拉车算法

```cpp
#include <bits/stdc++.h>
using namespace std;

int manacher(string &str) {
    string temp("^#");
    for (int i = 0; i < str.size(); ++i) {
        temp += str[i];
        temp += '#';
    }
    vector<int> p(temp.size());
    int id = 0, mx = 0, len = 0, pos = 0;
    for (int i = 1; i < temp.size(); ++i) {
        p[i] = mx > id ? min(p[2 * id - i], mx - id + 1) : 1;
        while (temp[i - p[i]] == temp[i + p[i]]) ++p[i];
        if (i + p[i] > mx) {
            id = i;
            mx = i + p[i];
        }
        if (p[i] > len) {
            len = p[i];
            pos = i;
        }
    }
    // 如果需要输出串的话
    // cout << str.substr((pos - len) / 2, len - 1) << endl;
    return len - 1;
}

int main() {
    string line;
    getline(cin, line);
    cout << manacher(line) << endl;
    // system("pause");
    return 0;
}
```

### 009 抢红包

结构体排序

```cpp
#include <bits/stdc++.h>
using namespace std;

struct People {
    int id, sum, cnt;
} p[10005];

int main() {
    int n, k, x, y;
    cin >> n;
    for (int i = 1; i <= n; ++i) {
        p[i].id = i;
        cin >> k;
        for (int j = 0; j < k; ++j) {
            cin >> x >> y;
            p[i].sum -= y;
            p[x].sum += y;
            p[x].cnt++;
        }
    }
    sort(p + 1, p + 1 + n, [](People p1, People p2) {
        if (p1.sum == p2.sum) {
            if (p1.cnt == p2.cnt)
                return p1.id < p2.id;
            return p1.cnt > p2.cnt;
        }
        return p1.sum > p2.sum;
    });
    for (int i = 1; i <= n; ++i) {
        printf("%d %.2lf\n", p[i].id, p[i].sum / 100.0);
    }
    return 0;
}
```

### 010 排座位

朋友关系可以传递（朋友的朋友也是朋友），所以用并查集处理，敌人关系不能传递，直接用数组标记。

```cpp
#include <bits/stdc++.h>
#define N 105

using namespace std;

int n, m, k, x, y, z;
int f[N], flag[N][N];

int find(int x) {
    return x == f[x] ? x : f[x] = find(f[x]);
}

void join(int x, int y) {
    int f1 = find(x), f2 = find(y);
    if (f1 != f2) {
        f[f1] = f2;
    }
}

int main() {
    scanf("%d%d%d", &n, &m, &k);
    for (int i = 1; i <= n; ++i)
        f[i] = i;
    memset(flag, 0, sizeof(flag));
    while (m--) {
        scanf("%d%d%d", &x, &y, &z);
        if (z == 1)
            join(x, y);
        else
            flag[x][y] = flag[y][x] = 1;
    }
    while (k--) {
        scanf("%d%d", &x, &y);
        if (find(x) == find(y)) {
            if (!flag[x][y])
                printf("No problem\n");
            else
                printf("OK but...\n");
        } else {
            if (!flag[x][y])
                printf("OK\n");
            else
                printf("No way\n");
        }
    }
    return 0;
}
```
