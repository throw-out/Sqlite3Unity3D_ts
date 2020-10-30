## 它是什么?

* **简介**
  > 基于Sqlite3开源数据库, 使用C#语言开发
  > 为Unity等C#平台提供简单易用丶高效性能的对象存储

* **Sqlite3简介**
  > Sqlite3是遵守ACID的关系型数据库, 小巧丶嵌入式丶无需安装
  > 能够跟很多种语言相结合, 运行时占有资源非常低

* **原项目**
  > 此项目基于[SQLite4Unity3d](https://github.com/robertohuertasm/SQLite4Unity3d), 优化结构丶扩展数据类型丶支持生成代码静态构建Mapping

## 如何使用?

* **创建并打开连接**
``` cs
var conn = new DBConnection("your database path");
conn.Open();
```

* **表操作**
``` cs
//删除表
conn.DropTable<Data>();
//创建表
conn.CreateTable<Data>();
```

* **插入记录**
``` cs
var data = new Data { id = 1, name = "Tom", age = 30 };
conn.Insert(data);
conn.InsertAll(new[]{
    new Data { id = 2 ,name = "Eric", age = 25 },
    new Data { id = 3 ,name = "John", age = 41 },
    new Data { id = 4 ,name = "Ellie", age = 25 },
});
```

* **查询记录**
``` cs
//如果有主键, 将以主键作为where条件
data = conn.Get<Data>(1);
//没有主键, 使用TableQuery查询
var datas = conn.Table<Data>()
    .Where(o => o.age == 25);
```

* **更新记录**
``` cs
//如果有主键, 将以主键作为where条件
conn.Update(data);
//没有主键, 使用TableQuery查询
conn.Table<Data>()
    .Where(d => d.id == data.id)
    .Update(data);
```

- **删除记录**
``` cs
//如果有主键, 将以主键作为where条件
conn.Delete(data);
//没有主键, 使用TableQuery查询
conn.Table<Data>()
    .Where(d => d.id == data.id)
    .Delete();
```

- **数据类**
``` cs
[Table("TData")]
public class Data
{
    [PrimaryKey]
    [AutoIncrement]
    public int id { get; set; }
    public string name { get; set; }
    [Column("Tage")]
    public int age { get; set; }

    public override string ToString()
    {
        return string.Format("{{id:{0},name:{1},agr:{2}}}", id, name, age);
    }
}
```

## **数据类型**
* **基础类型/数组类型**

|  类型           |      Base       | Array           | List          |
| :------------ | :-----------: | :------------: | :-----------: |
| bool            |        √          |        √           |        √         |
| byte            |        √          |        √           |        ×         |
| short           |        √          |        √           |        √         |
| int               |        √          |        √           |        √         |
| long            |        √          |        √           |        √         |
| float            |        √          |        √           |        √         |
| double        |        √          |        √           |        √         |
| decimal       |        √          |        √           |        √         |
| string          |        √          |        √           |        √         |

> (注: 注重性能时, 应避免直接使用Array和List)

* **Dictionary字典**

|  类型           | Key     | Value  | 支持    |
| :----------- | :------: | :------: | :------: |
| Dictionary  |   int      | int      |    √     |
| Dictionary  |   int      | string |    √     |
| Dictionary  |  string  | string |    √     |
| Dictionary  |  unkonw  | unkonw |    unkonw     |

> 自行扩展所需类型

* **接口类型**

|  类型          | 支持    |
| :----------- | :------: |
| IDataText  |   √       |
| IDataBytes |   √      |

> 子类型需实现以上接口 (注: 注重性能时, 不应使用以上方式)

## 特点
* 无需手动构建SQL语句
* 使用C#反射构建对象和数据表信息
* GenCode生成代码类, 静态构建对象以及数据表信息(无需使用反射)

## **性能测试**
* 暂无

## 说明
* 此项目创建于 `2020/08/15` , 尚不明确存在的BUG和性能问题, 未来将会陆续修复丶优化此项目.
* 如果您在使用中遇到任何问题, 请与我联系
* **[联系邮箱]:** <throw.out@qq.com>

## 它是什么?

* **简介**
  > 基于Sqlite3开源数据库, 使用C#语言开发
  > 为Unity等C#平台提供简单易用丶高效性能的对象存储

* **Sqlite3简介**
  > Sqlite3是遵守ACID的关系型数据库, 小巧丶嵌入式丶无需安装
  > 能够跟很多种语言相结合, 运行时占有资源非常低

* **原项目**
  > 此项目基于[SQLite4Unity3d](https://github.com/robertohuertasm/SQLite4Unity3d), 优化结构丶扩展数据类型丶支持生成代码静态构建Mapping

## 如何使用?

* **创建并打开连接**
``` cs
var conn = new DBConnection("your database path");
conn.Open();
```

* **表操作**
``` cs
//删除表
conn.DropTable<Data>();
//创建表
conn.CreateTable<Data>();
```

* **插入记录**
``` cs
var data = new Data { id = 1, name = "Tom", age = 30 };
conn.Insert(data);
conn.InsertAll(new[]{
    new Data { id = 2 ,name = "Eric", age = 25 },
    new Data { id = 3 ,name = "John", age = 41 },
    new Data { id = 4 ,name = "Ellie", age = 25 },
});
```

* **查询记录**
``` cs
//如果有主键, 将以主键作为where条件
data = conn.Get<Data>(1);
//没有主键, 使用TableQuery查询
var datas = conn.Table<Data>()
    .Where(o => o.age == 25);
```

* **更新记录**
``` cs
//如果有主键, 将以主键作为where条件
conn.Update(data);
//没有主键, 使用TableQuery查询
conn.Table<Data>()
    .Where(d => d.id == data.id)
    .Update(data);
```

- **删除记录**
``` cs
//如果有主键, 将以主键作为where条件
conn.Delete(data);
//没有主键, 使用TableQuery查询
conn.Table<Data>()
    .Where(d => d.id == data.id)
    .Delete();
```

- **数据类**
``` cs
[Table("TData")]
public class Data
{
    [PrimaryKey]
    [AutoIncrement]
    public int id { get; set; }
    public string name { get; set; }
    [Column("Tage")]
    public int age { get; set; }

    public override string ToString()
    {
        return string.Format("{{id:{0},name:{1},agr:{2}}}", id, name, age);
    }
}
```

## **数据类型**
* **基础类型/数组类型**

|  类型           |      Base       | Array           | List          |
| :------------ | :-----------: | :------------: | :-----------: |
| bool            |        √          |        √           |        √         |
| byte            |        √          |        √           |        ×         |
| short           |        √          |        √           |        √         |
| int               |        √          |        √           |        √         |
| long            |        √          |        √           |        √         |
| float            |        √          |        √           |        √         |
| double        |        √          |        √           |        √         |
| decimal       |        √          |        √           |        √         |
| string          |        √          |        √           |        √         |

> (注: 注重性能时, 应避免直接使用Array和List)

* **Dictionary字典**

|  类型           | Key     | Value  | 支持    |
| :----------- | :------: | :------: | :------: |
| Dictionary  |   int      | int      |    √     |
| Dictionary  |   int      | string |    √     |
| Dictionary  |  string  | string |    √     |
| Dictionary  |  unkonw  | unkonw |    unkonw     |

> 自行扩展所需类型

* **接口类型**

|  类型          | 支持    |
| :----------- | :------: |
| IDataText  |   √       |
| IDataBytes |   √      |

> 子类型需实现以上接口 (注: 注重性能时, 不应使用以上方式)

## 特点
* 无需手动构建SQL语句
* 使用C#反射构建对象和数据表信息
* GenCode生成代码类, 静态构建对象以及数据表信息(无需使用反射)

## **性能测试**
* 暂无

## 说明
* 此项目创建于 `2020/08/15` , 尚不明确存在的BUG和性能问题, 未来将会陆续修复丶优化此项目.
* 如果您在使用中遇到任何问题, 请与我联系
* **[联系邮箱]:** <throw.out@qq.com>

