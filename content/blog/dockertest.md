---
title: 用 Docker 解决单元测试外部依赖
date: 2022-05-01 15:20:06
tags:
  - go
  - docker
  - unittest
toc: true
---

搬砖时，写的大多是和数据库交互的 API 服务，当我厌倦了用 Postman 手工测试，尝试开始写一些单元测试，发现并不顺利。在 GitHub 上看到过几个项目是用 [sqlmock](https://github.com/DATA-DOG/go-sqlmock)。它的原理是实现了 `database/sql` 里的接口，然后单测中用正则表达式判断预期的 SQL 语句和实际执行的 SQL 语句是否匹配：

<!-- more -->

```go
func TestShouldUpdateStats(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("an error '%s' was not expected when opening a stub database connection", err)
	}
	defer db.Close()

	mock.ExpectBegin()
	mock.ExpectExec("UPDATE products").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO product_viewers").WithArgs(2, 3).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	// now we execute our method
	if err = recordStats(db, 2, 3); err != nil {
		t.Errorf("error was not expected while updating stats: %s", err)
	}

	// we make sure that all expectations were met
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("there were unfulfilled expectations: %s", err)
	}
}
```

实际尝试之后发现这种方式着实有点反人类，尤其使用了 ORM 后（鬼知道 ORM 把 SQL 构造成了啥样 😅）

## 是否有必要引入 Docker

除了 Docker，其实还有很多方案：

| 实际开发 |                      单元测试                      |
| :------: | :------------------------------------------------: |
|  MySQL   |                       SQLite                       |
|  Redis   | [Miniredis](https://github.com/alicebob/miniredis) |
|   ...    |                        ...                         |

具体情况具体分析，如果问题本身很简单，自然没必要引入 Docker

## compose + 脚本

在 `docker-compose.yml` 文件中定义好外部依赖。然后写一个脚本（bash 或 python 或 ...），按以下步骤执行测试：

1. docker-compose up
2. 数据库初始化（表结构、测试数据）
3. go test
4. docker-compose down

{% note info %}
整体思路就是这样，比较繁琐，就不演示了
{% endnote %}

## Dockertest

[Dockertest](https://github.com/ory/dockertest) 是一个简易的 Docker 客户端，提供了更便捷的方式管理单元测试的外部依赖。

### 创建示例项目

先安装接下来会用到的依赖：

```bash
export DEMO=$GOPATH/src/go.chensl.me/dockertest-demo

mkdir -p $DEMO
cd $DEMO

go mod init
go get github.com/go-sql-driver/mysql
go get github.com/golang-migrate/migrate/v4
go get github.com/jmoiron/sqlx
go get github.com/ory/dockertest/v3
go get github.com/stretchr/testify
```

提前预览一下项目结构：

```plaintext
.
├── db
│   ├── db.go
│   ├── db_test.go
│   ├── user.go
│   └── user_test.go
├── go.mod
├── go.sum
├── migrations
│   ├── 20220501170742_init.down.sql
│   └── 20220501170742_init.up.sql
└── model
    └── user.go

3 directories, 9 files
```

### DB 方法

用 [golang-migrate](https://github.com/golang-migrate/migrate) 生成 migration 脚本：

```bash
migrate create -ext sql -dir migrations -tz=Local init
```

```sql migrations/20220501170742_init.up.sql
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255) UNIQUE NOT NULL
);
```

```sql migrations/20220501170742_init.down.sql
DROP TABLE IF EXISTS `users`;
```

对应的 Go 结构体：

```go model/user.go
package model

type User struct {
	ID   int
	Name string
}
```

然后是这次需要测试的方法：

```go db/user.go
package db

import (
	"context"

	"github.com/jmoiron/sqlx"
	"go.chensl.me/dockertest-demo/model"
)

type UserDB struct {
	conn *sqlx.DB
}

func NewUserDB(conn *sqlx.DB) *UserDB {
	return &UserDB{conn: conn}
}

func (db *UserDB) Add(ctx context.Context, u *model.User) error {
	res, err := db.conn.ExecContext(ctx, "INSERT INTO users (name) VALUES (?)", u.Name)
	if err != nil {
		return err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	u.ID = int(id)
	return nil
}
```

### TestInstance

简单封装一下 dockertest 和 sqlx（借鉴了 [google/exposure-notifications-server](https://github.com/google/exposure-notifications-server/blob/9b73ca040965e3177db3c36df211a275bf6dcfa6/pkg/database/database_util.go#L69) 的代码）

```go db/db.go
package db

import (
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"testing"

	_ "github.com/go-sql-driver/mysql"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/mysql"
	_ "github.com/golang-migrate/migrate/v4/source/file"
	"github.com/jmoiron/sqlx"
	"github.com/ory/dockertest/v3"
	"github.com/ory/dockertest/v3/docker"
)

type TestInstance struct {
	pool       *dockertest.Pool
	resource   *dockertest.Resource
	conn       *sqlx.DB
	skipReason string
}

func MustTestInstance() *TestInstance {
	testInstance, err := NewTestInstance()
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	return testInstance
}

func NewTestInstance() (*TestInstance, error) {
	if skip, _ := strconv.ParseBool(os.Getenv("SKIP_DATABASE_TESTS")); skip {
		return &TestInstance{
			skipReason: "🚧 Skipping database tests (SKIP_DATABASE_TESTS is set)!",
		}, nil
	}

	pool, err := dockertest.NewPool("")
	if err != nil {
		return nil, fmt.Errorf("failed to create database docker pool: %w", err)
	}

	resource, err := pool.RunWithOptions(&dockertest.RunOptions{
		Repository: "mysql",
		Tag:        "5.7",
		Env:        []string{"MYSQL_ROOT_PASSWORD=secret"},
	}, func(c *docker.HostConfig) {
		c.AutoRemove = true
		c.RestartPolicy = docker.RestartPolicy{Name: "no"}
	})
	if err != nil {
		return nil, fmt.Errorf("failed to start database container: %w", err)
	}

	if err := resource.Expire(120); err != nil {
		return nil, fmt.Errorf("failed to expire database container: %w", err)
	}

	var conn *sqlx.DB
	if err := pool.Retry(func() error {
		var err error
		conn, err = sqlx.Connect("mysql", fmt.Sprintf("root:secret@(localhost:%s)/mysql", resource.GetPort("3306/tcp")))
		if err != nil {
			return err
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("failed waiting for database container to be ready: %w", err)
	}

	if err := migrateUp(conn.DB); err != nil {
		return nil, fmt.Errorf("failed to migrate database: %w", err)
	}

	return &TestInstance{
		pool:     pool,
		resource: resource,
		conn:     conn,
	}, nil
}

func (i *TestInstance) Conn(tb testing.TB) *sqlx.DB {
	tb.Helper()

	if i.skipReason != "" {
		tb.Skip(i.skipReason)
	}

	return i.conn
}

func (i *TestInstance) Close() error {
	if i.skipReason != "" {
		return nil
	}
	i.conn.Close()
	return i.pool.Purge(i.resource)
}

func migrateUp(db *sql.DB) error {
	driver, err := mysql.WithInstance(db, &mysql.Config{})
	if err != nil {
		return err
	}
	m, err := migrate.NewWithDatabaseInstance("file://../migrations", "mysql", driver)
	return m.Up()
}
```

借助 `TestMain`，在其他单测执行前，准备好环境：

```go db/db_test.go
package db

import (
	"os"
	"testing"
)

var testInstance *TestInstance

func TestMain(m *testing.M) {
	testInstance = MustTestInstance()
	code := m.Run()
	testInstance.Close()
	os.Exit(code)
}
```

### 最终效果

🎉 几乎和普通单元测试没有区别

```go db/user_test.go
package db

import (
	"context"
	"testing"

	"github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"go.chensl.me/dockertest-demo/model"
)

func TestUserDB_Add(t *testing.T) {
	ctx := context.Background()
	ud := NewUserDB(testInstance.Conn(t))

	u := &model.User{Name: "foo"}

	err := ud.Add(ctx, u)
	assert.NoError(t, err)
	assert.Equal(t, 1, u.ID)

	err = ud.Add(ctx, u)
	assert.True(t, isDuplicate(err))
}

func isDuplicate(err error) bool {
	if merr, ok := err.(*mysql.MySQLError); ok {
		return merr.Number == 1062
	}
	return false
}
```

执行单元测试，加上环境变量 `SKIP_DATABASE_TESTS` 可以跳过 dockertest：

```bash
go test -v -count=1 ./...

SKIP_DATABASE_TESTS=1 go test -v -count=1 ./...
```
