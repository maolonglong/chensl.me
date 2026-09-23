-- Companion script for "SQL 跑通了，数字却是错的".
-- Tested with DuckDB v1.5.5 and the semantic_views community extension 0.12.1.
-- Run: duckdb < traps.sql
-- Three queries fail on purpose, so the CLI exits with status 1.

INSTALL semantic_views FROM community;
LOAD semantic_views;

-- Three orders, their line items, and their refunds.
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

-- Trap: fan-out. Expected 400, returns 500.
SELECT SUM(o.amount) AS revenue
FROM orders AS o
JOIN order_lines AS l USING (order_id);

-- Trap: deduplicating by value. Returns 300.
SELECT SUM(DISTINCT o.amount) AS revenue
FROM orders AS o
JOIN order_lines AS l USING (order_id);

-- Fix: aggregate line items to the order grain before joining.
WITH lines_by_order AS (
    SELECT order_id, COUNT(*) AS line_count
    FROM order_lines
    GROUP BY order_id
)
SELECT SUM(o.amount) AS revenue, SUM(l.line_count) AS line_count
FROM orders AS o
LEFT JOIN lines_by_order AS l USING (order_id);

-- Plain SQL answers revenue by category without complaint: 200 + 300 = 500.
SELECT l.category, SUM(o.amount) AS revenue
FROM orders AS o
JOIN order_lines AS l USING (order_id)
GROUP BY l.category;

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

SELECT * FROM semantic_view('shop', metrics := ['revenue', 'line_count']);

SELECT * FROM semantic_view('shop',
    dimensions := ['store'],
    metrics := ['revenue', 'line_count']
);

-- Order revenue by line-item category: rejected as a fan trap.
SELECT * FROM semantic_view('shop',
    dimensions := ['category'],
    metrics := ['revenue']
);

SHOW SEMANTIC DIMENSIONS IN shop FOR METRIC revenue;

-- Trap: two fact tables under one parent. Expected 400 and 35.
SELECT SUM(o.amount) AS revenue, SUM(r.amount) AS refunded
FROM orders AS o
JOIN order_lines AS l USING (order_id)
LEFT JOIN refunds AS r USING (order_id);

-- Fix: aggregate each child table to the order grain, then join.
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

SELECT explain_output FROM explain_semantic_view('shop',
    dimensions := ['store'],
    metrics := ['net_revenue']
);

-- Refunds by line-item category: rejected, refunds only know the order.
SELECT * FROM semantic_view('shop',
    dimensions := ['category'],
    metrics := ['refunded']
);

-- Trap: average of averages. Expected 10/92, returns 0.3.
CREATE TABLE store_visits (store VARCHAR, converted INTEGER, visits INTEGER);
INSERT INTO store_visits VALUES ('A', 1, 2), ('B', 9, 90);

SELECT AVG(converted / visits) AS avg_of_rates FROM store_visits;

-- Fix: sum numerator and denominator, then divide.
SELECT SUM(converted) / SUM(visits) AS conversion_rate FROM store_visits;

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
    dimensions := ['store'],
    metrics := ['conversion_rate']
);

SELECT * FROM semantic_view('funnel',
    metrics := ['converted', 'visits', 'conversion_rate']
);

-- What the semantic view does not decide for you: a missing refund is NULL.
SELECT * FROM semantic_view('shop',
    dimensions := ['store'],
    metrics := ['revenue', 'refunded', 'net_revenue']
);

-- Decide that no refund means zero refund, then ask again.
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
    net_revenue AS revenue - COALESCE(refunded, 0)
);

SELECT * FROM semantic_view('shop',
    dimensions := ['store'],
    metrics := ['net_revenue']
);

-- Real-sized data: TPC-H at scale factor 0.01, generated offline.
CREATE SCHEMA tpch;
CALL dbgen(sf = 0.01, schema = 'tpch');

SELECT
    (SELECT SUM(o_totalprice) FROM tpch.orders) AS order_total,
    (SELECT SUM(o.o_totalprice)
     FROM tpch.orders AS o
     JOIN tpch.lineitem AS l ON l.l_orderkey = o.o_orderkey) AS joined_total;

CREATE SEMANTIC VIEW tpch_sales AS
TABLES (
    o AS tpch.orders PRIMARY KEY (o_orderkey),
    l AS tpch.lineitem PRIMARY KEY (l_orderkey, l_linenumber)
)
RELATIONSHIPS (
    line_to_order AS l(l_orderkey) REFERENCES o
)
DIMENSIONS (
    l.shipmode AS l.l_shipmode
)
METRICS (
    o.order_total AS SUM(o.o_totalprice),
    o.order_count AS COUNT(*),
    l.line_count AS COUNT(*)
);

SELECT * FROM semantic_view('tpch_sales',
    metrics := ['order_total', 'order_count', 'line_count']
);

SELECT * FROM semantic_view('tpch_sales',
    dimensions := ['shipmode'],
    metrics := ['line_count']
) ORDER BY shipmode;

-- Order total by ship mode: rejected as a fan trap.
SELECT * FROM semantic_view('tpch_sales',
    dimensions := ['shipmode'],
    metrics := ['order_total']
);
