+++
title = "SQL 跑通了，数字却是错的"
description = "用三笔订单和 DuckDB 复现数据分析里几个常见的坑，看看 Semantic View 是怎样避开它们的。"
date = 2026-09-23T00:00:00+08:00
draft = false
+++

最近在学 Data Agent，读到的材料里反复出现一个判断：让模型写出能运行的 SQL 并不难，难的是让它算出正确的数字。

数据分析里有一类错误很隐蔽。SQL 语法没问题，数据库也正常返回了结果，数字却是错的，而且错得像模有样，没人会怀疑。这些坑在 LLM 出现之前就存在，BI 工具用语义层来处理它们已经很多年了。Snowflake 的 Semantic View 是把语义层做成数据库对象的一种设计。

这篇用三笔订单把几个常见的坑复现一遍，再看 Semantic View 是怎样避开它们的。实验用 DuckDB 和一个受 Snowflake 启发的社区扩展，本地就能跑，不需要云账号。完整脚本在 [traps.sql](traps.sql)，也可以跟着正文一段段粘进同一个 `duckdb` 会话。

## 同一个词，好几种算法

第一个坑和 SQL 无关。

Snowflake 内部让 Agent 回答业务问题时发现，“活跃客户”在不同的表里有不同的算法：有的看 30 天内是否登录，有的看是否有消耗且不是试用账号，还有的直接按账号去重、不区分地区。[^context-layer] Agent 报一个数，旧看板报另一个数，没人知道该信哪个。

每种算法单独看都说得通，问题是它们散落在各个报表和查询里。人问“活跃客户有多少”时，选哪种算法本身就是一次口径决策，模型更不可能替业务做这个决定。

Semantic View 的做法是把指标定义成数据库里的一个对象。“活跃客户”只定义一次，写清楚用哪张表、什么条件、怎么聚合，报表、看板和 Agent 都查这同一个定义。接下来几个坑都要动手，定义指标的具体写法在后面会看到。

## 准备三张表

先装扩展，再建三张表：订单、订单明细和退款。金额用整数，方便心算。

```sql
INSTALL semantic_views FROM community;
LOAD semantic_views;

CREATE TABLE orders (order_id VARCHAR, store VARCHAR, amount INTEGER);
CREATE TABLE order_lines (
    line_id VARCHAR, order_id VARCHAR, category VARCHAR
);
CREATE TABLE refunds (refund_id VARCHAR, order_id VARCHAR, amount INTEGER);

INSERT INTO orders VALUES
    ('O1', 'A', 100), ('O2', 'A', 100), ('O3', 'B', 200);
INSERT INTO order_lines VALUES
    ('L1', 'O1', 'coat'), ('L2', 'O1', 'shoe'),
    ('L3', 'O2', 'coat'), ('L4', 'O3', 'shoe');
INSERT INTO refunds VALUES
    ('R1', 'O1', 10), ('R2', 'O1', 5), ('R3', 'O2', 20);
```

| 订单 | 门店 | 金额 | 明细 | 退款 |
|---|---|---:|---|---|
| O1 | A | 100 | 外套、鞋 | 10、5 |
| O2 | A | 100 | 外套 | 20 |
| O3 | B | 200 | 鞋 | 无 |

心算一下：订单总额 400，退款 35，净收入 365。后面每个查询都拿这几个数对照。

三张表都有 `order_id`，但只有在 `orders` 里它是唯一的。`orders` 的一行是一笔订单，`order_lines` 的一行是订单里的一种商品，`refunds` 的一行是一次退款。一行代表什么，叫作这张表的**粒度**。后面所有的坑都和粒度有关。

## join 以后，金额变多了

想按商品类别看收入，很自然会把订单和明细 join 起来。先不分组，看看总数：

```sql
SELECT SUM(o.amount) AS revenue
FROM orders AS o
JOIN order_lines AS l USING (order_id);
```

结果是 500，多了 100。O1 有两条明细，join 以后 O1 变成两行，它的 100 被加了两次。这就是扇出（fan trap）：从“一”的一侧 join 到“多”的一侧，一侧的数值被复制了。

一个常见的补救是加 `DISTINCT`：

```sql
SELECT SUM(DISTINCT o.amount) AS revenue
FROM orders AS o
JOIN order_lines AS l USING (order_id);
```

结果是 300，错得更远。`SUM(DISTINCT)` 按金额去重，O1 和 O2 恰好都是 100，被当成了同一笔。去重应该按订单这个实体，而不是按碰巧相同的数值。要是测试数据里没有两笔金额相同的订单，这个错误根本不会暴露。

正确的手写方式是先把“多”的一侧聚合到订单上，让每笔订单只剩一行，再去 join：

```sql
WITH lines_by_order AS (
    SELECT order_id, COUNT(*) AS line_count
    FROM order_lines
    GROUP BY order_id
)
SELECT SUM(o.amount) AS revenue, SUM(l.line_count) AS line_count
FROM orders AS o
LEFT JOIN lines_by_order AS l USING (order_id);
```

收入 400，明细 4 条，都对了。只算收入的话直接对 `orders` 求和就行，这里把明细条数也带上，是为了和后面的 Semantic View 对照。写法不难，难的是每次都要记得判断：哪张表在“多”的一侧，要先聚合到什么粒度。

现在把同样的表定义成一个 Semantic View：

```sql
CREATE SEMANTIC VIEW shop AS
TABLES (
    o AS orders PRIMARY KEY (order_id),
    l AS order_lines PRIMARY KEY (line_id)
)
RELATIONSHIPS (
    line_to_order AS l(order_id) REFERENCES o
)
DIMENSIONS (
    o.store AS o.store,
    l.category AS l.category
)
METRICS (
    o.revenue AS SUM(o.amount),
    l.line_count AS COUNT(*)
);
```

这段定义回答了四件事：

- `TABLES` 声明每张表和它的主键，也就是一行代表什么。
- `RELATIONSHIPS` 声明明细通过 `order_id` 指向订单。多条明细对应一笔订单，方向是多对一。
- `DIMENSIONS` 是可以用来分组、过滤的属性。
- `METRICS` 是指标。`o.revenue` 前面的 `o.` 把它绑在订单表上，意思是在订单的粒度上求和。

查询时不再写 join，只说要哪些指标、按什么维度：

```sql
SELECT * FROM semantic_view('shop', metrics := ['revenue', 'line_count']);
```

| `revenue` | `line_count` |
|---:|---:|
| 400 | 4 |

和手写的结果一样，只是 join 和预聚合都不用写了。按门店分组也没问题，A 店收入 200、明细 3 条，B 店收入 200、明细 1 条。

再试一开始那个问题，按商品类别看订单收入：

```sql
SELECT * FROM semantic_view('shop',
    dimensions := ['category'],
    metrics := ['revenue']
);
```

```text
Binder Error: semantic_view: semantic view 'shop': fan trap detected --
metric 'revenue' (table 'o') would be duplicated when joined to dimension
'category' (table 'l') via relationship 'line_to_order' (many-to-one
cardinality, inferred: FK is not PK/UNIQUE). This would inflate
aggregation results. ...
```

它没有返回一个虚高的数，而是直接拒绝。手写 SQL 按 `l.category` 分组倒是能跑出结果：外套 200，鞋 300，每个类别单看都像回事，加起来却是 500。O1 同时包含外套和鞋，这 100 块该算给哪个类别？数据里没有答案。想回答这个问题，需要明细级别的金额，或者一条大家认可的分摊规则。

报错之前，也可以先问哪些维度能和某个指标一起用：

```sql
SHOW SEMANTIC DIMENSIONS IN shop FOR METRIC revenue;
```

结果只有 `store`。规则是：维度所在的表，粒度要和指标所在的表相同或更粗。按门店看订单收入可以，按明细上的类别看不行。Snowflake 的官方文档写的是同一条规则，不合法的组合也会报错。[^sf-querying]

这个扩展的语法和 Snowflake 大体一致，查询写法有些差别。Snowflake 写成 `SEMANTIC_VIEW(shop DIMENSIONS ... METRICS ...)`，这里是 `semantic_view('shop', dimensions := [...], metrics := [...])`。[^duckdb-sv]

## 两张明细表一起 join

现在把退款也加进来，想同时看收入和退款：

```sql
SELECT SUM(o.amount) AS revenue, SUM(r.amount) AS refunded
FROM orders AS o
JOIN order_lines AS l USING (order_id)
LEFT JOIN refunds AS r USING (order_id);
```

收入 700，退款 50，两个数都错了。O1 有 2 条明细、2 笔退款，join 以后变成 2 × 2 = 4 行，订单金额和退款金额各自被复制。明细和退款都挂在订单下面，彼此没有直接关系，一起 join 就会互相放大。这叫 chasm trap。

正确的做法是把两边各自聚合到订单上，再和订单 join：

```sql
WITH lines_by_order AS (
    SELECT order_id, COUNT(*) AS line_count
    FROM order_lines
    GROUP BY order_id
),
refunds_by_order AS (
    SELECT order_id, SUM(amount) AS refunded
    FROM refunds
    GROUP BY order_id
)
SELECT
    SUM(o.amount) AS revenue,
    SUM(r.refunded) AS refunded,
    SUM(o.amount - COALESCE(r.refunded, 0)) AS net_revenue,
    SUM(l.line_count) AS line_count
FROM orders AS o
LEFT JOIN lines_by_order AS l USING (order_id)
LEFT JOIN refunds_by_order AS r USING (order_id);
```

收入 400、退款 35、净收入 365、明细 4 条。O3 没有退款，join 以后是 `NULL`，所以净收入里要写 `COALESCE(r.refunded, 0)`。手写时这一步往往顺手就补上了，后面会看到，换到语义层以后它得单独决定。

比起最初的查询，这里多了两个 CTE，而且每多一张挂在订单下面的表，就要再多一个。Semantic View 里只要多声明一张表、一条关系和几个指标：

```sql
CREATE OR REPLACE SEMANTIC VIEW shop AS
TABLES (
    o AS orders PRIMARY KEY (order_id),
    l AS order_lines PRIMARY KEY (line_id),
    r AS refunds PRIMARY KEY (refund_id)
)
RELATIONSHIPS (
    line_to_order AS l(order_id) REFERENCES o,
    refund_to_order AS r(order_id) REFERENCES o
)
DIMENSIONS (
    o.store AS o.store,
    l.category AS l.category
)
METRICS (
    o.revenue AS SUM(o.amount),
    l.line_count AS COUNT(*),
    r.refunded AS SUM(r.amount),
    net_revenue AS revenue - refunded
);

SELECT * FROM semantic_view('shop',
    metrics := ['revenue', 'refunded', 'net_revenue', 'line_count']
);
```

| `revenue` | `refunded` | `net_revenue` | `line_count` |
|---:|---:|---:|---:|
| 400 | 35 | 365 | 4 |

`net_revenue` 前面没有表前缀，它是由另外两个指标算出来的派生指标。

这个扩展可以展开它实际生成的 SQL。按门店看净收入：

```sql
SELECT explain_output FROM explain_semantic_view('shop',
    dimensions := ['store'],
    metrics := ['net_revenue']
);
```

输出里 `Expanded SQL` 那一段是这样的：

```sql
WITH __sv_grain_0 AS (
    SELECT
        o.store AS "__sv_d0",
        SUM(o.amount) AS "__sv_m0"
    FROM "memory"."main"."orders" AS "o"
    GROUP BY
        1
),
__sv_grain_1 AS (
    SELECT
        o.store AS "__sv_d0",
        SUM(CASE WHEN "r"."refund_id" IS NOT NULL THEN r.amount END) AS "__sv_m0"
    FROM "memory"."main"."refunds" AS "r"
    LEFT JOIN "memory"."main"."orders" AS "o" ON "r"."order_id" = "o"."order_id"
    GROUP BY
        1
)
SELECT
    COALESCE("__sv_grain_0"."__sv_d0", "__sv_grain_1"."__sv_d0") AS "store",
    "__sv_grain_0"."__sv_m0" - "__sv_grain_1"."__sv_m0" AS "net_revenue"
FROM __sv_grain_0
FULL OUTER JOIN __sv_grain_1
    ON "__sv_grain_0"."__sv_d0" IS NOT DISTINCT FROM "__sv_grain_1"."__sv_d0"
```

订单和退款各自按门店聚合，再按门店合并。退款那一路也 join 了订单表，但只是为了拿到门店，方向是多对一，不会复制退款的行。和前面手写的 CTE 是同一个思路，只是这些 CTE 由语义层按查询的维度生成。

如果按商品类别看退款，会得到和上一节一样的 fan trap 报错。退款只记到了订单上，数据里没有它属于哪个类别的信息。

## 平均数的平均

换一个例子。门店 A 来了 2 个人，1 个下单，转化率 50%；门店 B 来了 90 个人，9 个下单，转化率 10%。

```sql
CREATE TABLE store_visits (store VARCHAR, converted INTEGER, visits INTEGER);
INSERT INTO store_visits VALUES ('A', 1, 2), ('B', 9, 90);

SELECT AVG(converted / visits) AS avg_of_rates FROM store_visits;
```

结果是 0.3，也就是 30%。整体转化率应该是 10 / 92，大约 10.87%。A 店只来了 2 个人，却和 90 个人的 B 店占了同样的权重。

手写的正确写法是先分别求和，最后再除：

```sql
SELECT SUM(converted) / SUM(visits) AS conversion_rate FROM store_visits;
```

按门店看就加上 `GROUP BY store`。

如果报表里只存了每个门店的转化率，分子和分母都丢了，就再也算不回整体值。Semantic View 存的是公式，而不是算好的结果：

```sql
CREATE SEMANTIC VIEW funnel AS
TABLES (
    v AS store_visits PRIMARY KEY (store)
)
DIMENSIONS (
    v.store AS v.store
)
METRICS (
    v.converted AS SUM(v.converted),
    v.visits AS SUM(v.visits),
    conversion_rate AS converted / visits
);

SELECT * FROM semantic_view('funnel',
    metrics := ['converted', 'visits', 'conversion_rate']
);
```

| `converted` | `visits` | `conversion_rate` |
|---:|---:|---:|
| 10 | 92 | 0.10869565217391304 |

按门店查，得到 50% 和 10%；不分组，得到 10.87%。不管按什么粒度查，它都用分子的和除以分母的和重新算。

前提是指标本身定义对了。如果把转化率写成 `AVG(v.converted / v.visits)`，Semantic View 也会老老实实地返回 0.3。它能保证每次都按同一个公式算，但保证不了公式本身是对的。

## 它不替你做的决定

回到 `shop`，按门店看净收入：

```sql
SELECT * FROM semantic_view('shop',
    dimensions := ['store'],
    metrics := ['revenue', 'refunded', 'net_revenue']
);
```

| `store` | `revenue` | `refunded` | `net_revenue` |
|---|---:|---:|---:|
| A | 200 | 35 | 165 |
| B | 200 | NULL | NULL |

B 店的净收入是 `NULL`。B 店没有退款记录，退款那一路没有 B 的行，`FULL OUTER JOIN` 以后 B 的退款就是 `NULL`，`200 - NULL` 还是 `NULL`。前面不分组时得到 365，是因为全部退款加在一起有值，这个问题被盖住了。

“没有退款”应该当成 0，还是当成“不知道”？对净收入来说，大概率是 0。但这是业务口径，不是 join 规则，语义层不会替你决定。把 `net_revenue` 改成下面这样，重建视图（完整语句在 `traps.sql` 里）：

```sql
net_revenue AS revenue - COALESCE(refunded, 0)
```

B 店的净收入就变成了 200。这和手写 SQL 里的 `COALESCE(r.refunded, 0)` 是同一个决定，只是现在写在指标定义里，所有查询都按它算。

类似的决定还有不少。“8 月收入”按下单时间、付款时间还是发货时间算？客户 8 月从华东迁到了华南，这个客户 7 月的收入算哪个地区？这些都得在定义维度和指标时由人来写清楚。Semantic View 负责的是：按写下的定义，用正确的粒度算出来。

## 换成 TPC-H 试试

三笔订单方便心算，但规模太小。DuckDB 自带 TPC-H 数据生成器，不用联网，一条 `CALL` 就能生成一套订单数据。放进单独的 schema，避免和前面的 `orders` 重名：

```sql
CREATE SCHEMA tpch;
CALL dbgen(sf = 0.01, schema = 'tpch');

SELECT
    (SELECT SUM(o_totalprice) FROM tpch.orders) AS order_total,
    (SELECT SUM(o.o_totalprice)
     FROM tpch.orders AS o
     JOIN tpch.lineitem AS l ON l.l_orderkey = o.o_orderkey) AS joined_total;
```

| `order_total` | `joined_total` |
|---:|---:|
| 2127396830.02 | 10645296330.84 |

1.5 万笔订单、6 万多条明细，join 以后订单总额变成了原来的 5 倍。放在真实的报表里，这种错误未必一眼就能看出来。

同样定义一个 Semantic View，这次多了一个 `FACTS` 子句：

```sql
CREATE SEMANTIC VIEW tpch_sales AS
TABLES (
    o AS tpch.orders PRIMARY KEY (o_orderkey),
    l AS tpch.lineitem PRIMARY KEY (l_orderkey, l_linenumber)
)
RELATIONSHIPS (
    line_to_order AS l(l_orderkey) REFERENCES o
)
FACTS (
    l.net_price AS l.l_extendedprice * (1 - l.l_discount)
)
DIMENSIONS (
    l.shipmode AS l.l_shipmode
)
METRICS (
    o.order_total AS SUM(o.o_totalprice),
    o.order_count AS COUNT(*),
    l.line_count AS COUNT(*),
    l.net_revenue AS SUM(l.net_price)
);

SELECT * FROM semantic_view('tpch_sales',
    metrics := ['order_total', 'order_count', 'line_count']
);
```

| `order_total` | `order_count` | `line_count` |
|---:|---:|---:|
| 2127396830.02 | 15000 | 60175 |

`FACTS` 是 Semantic View 的第五个构件，前面三笔订单的数据里没有需要它的地方。fact 是行级的命名表达式：`net_price` 是每条明细的折后金额，等于原价乘以 1 减折扣。它本身不聚合，由指标来引用，`net_revenue` 就是对它求和。折扣怎么算只写这一次，其他用到折后金额的指标都引用同一个 fact。

按运输方式（`shipmode`）看订单总额，会得到和前面一样的 fan trap 报错：一笔订单的几条明细可能走不同的运输方式。报错信息给的建议之一，是换成和维度在同一张表上的指标。明细上的折后金额就是这样的指标：

```sql
SELECT * FROM semantic_view('tpch_sales',
    dimensions := ['shipmode'],
    metrics := ['net_revenue']
) ORDER BY shipmode;
```

| `shipmode` | `net_revenue` |
|---|---:|
| AIR | 288119126.8843 |
| FOB | 292231642.5268 |
| MAIL | 295057347.7332 |
| RAIL | 289935768.2011 |
| REG AIR | 291508525.3958 |
| SHIP | 290685560.2993 |
| TRUCK | 297596971.0534 |

不分组时 `net_revenue` 是 2045134942.0939，和直接在 `lineitem` 上对折后金额求和的结果一致。

想在更大的数据上复现双事实的坑，可以用 DuckDB 的 `tpcds` 扩展生成 TPC-DS 数据。Snowflake 那篇博客的附录里有一条模型在 TPC-DS 上生成的 SQL：它把 `catalog_sales` 和 `web_sales` 两张销售表同时 join 到客户上再求和，正是前面两张明细表一起 join 的问题。[^sf-traps]

## 从写查询到选列

回头对照手写的正确 SQL，Semantic View 做了什么就清楚了：

| 坑 | 手写时要记住的事 | Semantic View 里的对应 |
|---|---|---|
| 扇出 | 先把明细聚合到订单，再 join | 主键和关系标出一对多，指标挂在自己的表上 |
| 按金额去重 | 按订单去重，而不是按金额 | 主键声明了一行代表什么 |
| 两张明细表一起 join | 每张明细表各写一个 CTE | 按粒度拆成几段聚合，再合并 |
| 平均数的平均 | 保留分子和分母，最后再除 | 派生指标存公式，按查询粒度重算 |
| 按明细维度看订单指标 | 自己意识到这个问题没有答案 | 直接报错 |

每一件事手写 SQL 都能做对，但每次都要重新判断。Semantic View 把这些判断写进定义，之后的查询都按同一套规则来。

Snowflake 的 Will Pugh 把这种变化概括为：“Rather than choosing how to create a query, you choose what dimensions and metrics you want, and the semantic SQL does the rest.”[^sf-traps]

这也是 Data Agent 需要语义层的原因。模型擅长理解问题，“收入”该对应哪个指标、“按地区”该对应哪个维度，这些交给它合适。Snowflake 的语义视图可以给表、指标和维度写同义词（`WITH SYNONYMS`）和说明（`COMMENT`），它们不参与计算，作用是帮模型和人把业务说法对上定义。[^sf-create]join 顺序和聚合粒度则有确定的规则，不必让模型每次重新推一遍。模型只需要选指标和维度，选错时拿到的是一条能看懂的报错，它可以据此换一种问法，或者去问用户。

但前提没变：指标得有人定义，定义还得是对的。“活跃客户”到底怎么算，仍然要业务来定。

本文实验用 DuckDB v1.5.5 和 semantic_views 0.12.1。文中不少查询需要 0.12.0 以上：更早的版本不支持把不同粒度的指标放在一起查，还有几种查询形态会返回放大的结果而不报错。[^duckdb-changelog]文中 Snowflake 的规则来自官方文档和工程博客，没有在 Snowflake 账号上实际执行。

[^context-layer]: Aniruth Narayanan，[Building a Context Layer for AI Agents](https://www.snowflake.com/en/blog/snowflake-internal-context-layer-for-ai-agents/)，2026 年 8 月 17 日。
[^sf-querying]: Snowflake Documentation，[Querying semantic views](https://docs.snowflake.com/en/user-guide/views-semantic/querying)。
[^sf-create]: Snowflake Documentation，[CREATE SEMANTIC VIEW](https://docs.snowflake.com/en/sql-reference/sql/create-semantic-view)。
[^duckdb-sv]: [anentropic/duckdb-semantic-views](https://github.com/anentropic/duckdb-semantic-views)，DuckDB 社区扩展，安装页见 [semantic_views](https://duckdb.org/community_extensions/extensions/semantic_views)。
[^sf-traps]: Will Pugh，[Why Do We Need Semantic Views? Solving BI & SQL Traps](https://www.snowflake.com/en/blog/engineering/why-we-need-semantic-views/)，2026 年 3 月 9 日。
[^duckdb-changelog]: semantic_views 的 [CHANGELOG](https://github.com/anentropic/duckdb-semantic-views/blob/main/CHANGELOG.md)，参见 0.11.0 和 0.12.0。
