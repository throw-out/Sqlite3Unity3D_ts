import * as CS from "csharp";

import { DBConnection } from "./DBConnection";
import { DBMapping } from "./DBMapping";
import { DBType } from "./DBType";

/**读取SqliteDataReader中的值 */
export function readValue(reader: CS.SQLite.SQLiteReader, index: string | number, type: DBType) {
    if (typeof index === "string") {
        index = reader.GetOrdinal(index);
        return readValue(reader, index, type);
    }
    if (reader.IsDBNull(index))
        return undefined;
    switch (type) {
        case "string":
            return reader.GetString(index);
        case "number":
            return reader.GetDouble(index);
        case "integer":
            //return reader.GetInt32(index);
            return Math.floor(reader.GetDouble(index));
        case "bigint":
            return reader.GetInt64(index);
        case "boolean":
            return reader.GetInt32(index) != 0;
        case "number[]":
            {
                let content = reader.GetString(index) ?? "";
                return content.split("|").filter(o => o.length > 0).map(o => parseFloat(o));
            }
        case "string[]":
            {
                let content = reader.GetString(index) ?? "";
                return content.split("|").map(o => o.replace(/&brvbar;/g, "|"));
            }
        case "object":
            {
                //对Object类型从Json反序列化
                let content = reader.GetString(index);
                return content ? JSON.parse(content) : undefined;
            }
    }

    throw new Error("NotSupportedException: Cannot store type " + type);
}
/**绑定SqliteCommand参数 */
export function bindParameter(command: CS.SQLite.SQLiteCommand, value: any): number {
    if (value === undefined || value === null || value === void 0) {
        command.Bind("");
        return;
    }

    switch (typeof (value)) {
        case "string":
        case "number":
        case "bigint":
            command.Bind(value);
            return;
        case "boolean":
            command.Bind(value ? 1 : 0);
            return;
        //对Object类型进行Json序列化
        case "object":
            let content = "";
            if (Array.isArray(value)) {
                if (value.length > 0) {
                    if (typeof (value[0]) === "string") {
                        content = (value as string[]).map(o => o.replace(/\|/g, "&brvbar;")).join("|");
                    } else {
                        content = value.join("|");
                    }
                }
            } else {
                content = JSON.stringify(value);
            }
            command.Bind(content);
            return;
    }

    throw new Error("NotSupportedException: Cannot store type " + typeof (value));
}
function getDefaultValue(val: any) {
    switch (typeof (val)) {
        case "object":
            let ret: object = Array.isArray(val) ? [] : Object.create(Object.getPrototypeOf(val));
            Object.assign(ret, val);
            Object.setPrototypeOf(ret, Object.getPrototypeOf(val));
            return ret;
        case "function":
            return val();
        default:
            return val;
    }
}

export class DBCommand {
    public commandText: string;
    private _conn: DBConnection;
    private _bindings: Array<any>;

    constructor(conn: DBConnection) {
        this._conn = conn;
        this.commandText = "";
        this._bindings = new Array();
    }

    public executeUpdate() {
        if (this._conn.trace) console.log(this);

        let command = this.prepare();
        try {
            return command.ExecuteNonQuery();
        }
        finally {
            this.finally(command);
        }
    }
    public executeQuery<T extends object>(map: DBMapping) {
        if (this._conn.trace) console.log(this);

        let command = this.prepare();
        let reader: CS.SQLite.SQLiteReader;
        try {
            let columns = map.columns;
            let result = new Array<T>();
            //Execute Query
            reader = command.ExecuteReader();
            while (reader.Read()) {
                let obj = map.createInstance();
                for (let i = 0; i < columns.length; i++) {
                    let col = columns[i];
                    let val = readValue(reader, col.name, col.propType) ?? getDefaultValue(col.defaultValue);
                    if (val !== undefined && val !== null && val !== void 0)
                        obj[col.prop] = val;
                }
                result.push(obj as T);
            }
            return result;
        }
        finally {
            this.finally(command, reader);
        }
    }
    public executeQueryFileds<T>(...columns: (keyof T)[]): T[] {
        if (this._conn.trace) console.log(this);

        let command = this.prepare();
        let reader: CS.SQLite.SQLiteReader;
        try {
            let result = new Array<T>();
            //Execute Query
            reader = command.ExecuteReader();
            while (reader.Read()) {
                let obj: T = Object.create(null);
                for (let i = 0; i < columns.length; i++) {
                    obj[columns[i]] = readValue(reader, columns[i] as string, "string");
                }
                result.push(obj);
            }
            return result;
        }
        finally {
            this.finally(command, reader);
        }
    }
    public executeScalar<T>(type?: "string" | "number" | "bigint" | "boolean") {
        if (this._conn.trace) console.log(this);

        let command = this.prepare();
        let reader: CS.SQLite.SQLiteReader;
        try {
            reader = command.ExecuteReader();
            while (reader.Read()) {
                return readValue(reader, 0, type ?? "string") as T;
            }
        }
        finally {
            this.finally(command, reader);
        }
        return null;
    }
    public lastInserRowid(map: DBMapping) {
        let query = "SELECT last_insert_rowid() FROM \"" + map.tableName + "\";";
        if (this._conn.trace) console.log(query);

        let command = new CS.SQLite.SQLiteCommand(this._conn.handle);
        command.CommandText = query;
        //command.Prepare();
        let reader: CS.SQLite.SQLiteReader;
        try {
            reader = command.ExecuteReader();
            while (reader.Read()) {
                return readValue(reader, 0, map.pk.propType);
            }
        }
        finally {
            this.finally(command, reader);
        }
        return -1;
    }
    public bind(val: any) {
        this._bindings.push(val);
    }
    private bindAll(command: CS.SQLite.SQLiteCommand) {
        for (let val of this._bindings) {
            bindParameter(command, val);
        }
    }
    private prepare(): CS.SQLite.SQLiteCommand {
        let command = new CS.SQLite.SQLiteCommand(this._conn.handle);
        command.CommandText = this.commandText;
        //command.Prepare();
        this.bindAll(command);
        return command;
    }
    private finally(command: CS.SQLite.SQLiteCommand, reader?: CS.SQLite.SQLiteReader) {
        //command.Cancel();
        //command.Dispose();
        reader?.Close();
        reader?.Dispose();
    }
    public toString() {
        return this.commandText + "\nargs:" + this._bindings.map(o => typeof o === "object" ? JSON.stringify(o) : o);
    }
}