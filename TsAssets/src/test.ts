import { DBConnection } from "./sqlite3/dbConnection";
import { Column } from "./sqlite3/utils/attribute";


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

let conn = new DBConnection("db path");
conn.open();

let data = new Data();
let state = conn.table(Data)
    .where(o => o.id == data.id && data.id != 0)
    .updateOrInsert(data);

let id = data.id;
state = conn.table(Data)
    .where(o => o.id == id && id != 0, { id })
    .updateOrInsert(data);

let queryAll: Data[] = conn.table(Data)
    .query();
let queryBetween: Data[] = conn.table(Data)
    .between(o => o.age, "20", "30")
    .query();



