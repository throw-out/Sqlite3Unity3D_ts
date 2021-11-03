[![license](http://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/throw-out/Sqlite3Unity3D_ts/blob/main/LICENSE)

## 它是什么?

* **简介**
  > 基于Sqlite3开源数据库, 使用typescript语言开发. 
  > 搭配[puerts](https://github.com/Tencent/puerts)为Unity平台提供简单易用丶高效性能的对象存储. 

* **Sqlite3简介**
  > Sqlite3是遵守ACID的关系型数据库, 小巧丶嵌入式丶无需安装. 
  > 能够跟很多种语言相结合, 运行时占有资源非常低. 

* **原项目**
  > 此项目基于[SQLite4Unity3d](https://github.com/robertohuertasm/SQLite4Unity3d)
 
## 如何使用?
* **数据类**
``` ts
  class Data {
      @Column("number")
      public id: number;
      @Column("string")
      public name: string;
      @Column("number")
      public age: number;
      @Column("number")
      public sex: number;
  }
```

* **创建并打开连接**
``` ts
    let conn = new DBConnection("db path");
    conn.open();
```

* **表操作**
``` ts
    //创建表
    conn.createTable(Data);
    //清空表
    conn.clearTable(Data);
    //删除表
    conn.dropTable(Data);
```

* **插入/更新记录**
``` ts
    let data = new Data();
    //直接插入
    conn.insert(data);
    //条件更新或插入数据
    //注:基于字符串解析, 无法直接获取data.id的值, 需要通过对象传入
    let id = data.id;
    let ret = conn.table(Data)
        .where(o => o.id == id && id != 0, { id })
        .updateOrInsert(data);
```

* **查询记录**
``` ts
    let queryAll: Data[] = conn.table(Data)
        .query();
    let queryBetween: Data[] = conn.table(Data)
        .between(o => o.age, "20", "30")
        .query();
```

- **删除记录**
``` ts
    let ret = conn.table(Data)
        .where(o => o.id == 10)
        .delete();
```

## 特点
* 无需手动构建SQL语句
* 运行时构建对象和数据表信息
* 有限的支持Lambda表达式解析(字符串解析)

## **性能测试**
* 暂无

## 说明
* 此项目创建于 `2020/10/30` , 尚不明确存在的BUG和性能问题, 未来将会陆续修复丶优化此项目.
* 如果您在使用中遇到任何问题, 请与我联系
* **[联系邮箱]:** <throw.out@qq.com>
