import * as CS from "csharp";
import { bindParameter } from "./DBCommand";
import { DBConnection } from "./DBConnection";

type SqliteCommand = CS.SQLite.SQLiteCommand;

class DBCommandInsert {
    public commandText: string;
    private _conn: DBConnection;
    private _command: SqliteCommand;

    constructor(conn: DBConnection) {
        this._conn = conn;
        this.commandText = "";
    }
    public isConnect(conn: DBConnection) {
        return this._conn === conn;
    }
    public isValid() {
        return this._conn && this._conn.opened && this._conn.handle.Connected;
    }
    public executeUpdate(objs: any[]) {
        if (this._conn.trace) {
            console.log(this.commandText + "\nargs:" + objs);
        }

        if (!this._command)
            this._command = this.prepare();
        //bind the values.
        this._command.ClearBind();
        if (objs) {
            objs.forEach(val => bindParameter(this._command, val));
        }
        return this._command.ExecuteNonQuery();
    }
    public dispose() {
        let command = this._command;
        this._command = null;
        if (command) {
            //command.Cancel();
            //command.Dispose();
        }
    }
    private prepare(): SqliteCommand {
        let command = new CS.SQLite.SQLiteCommand(this._conn.handle);
        command.CommandText = this.commandText;

        //command.Prepare();
        return command;
    }
}

export {
    DBCommandInsert,
}