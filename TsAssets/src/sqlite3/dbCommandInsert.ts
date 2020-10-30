import * as CS from "csharp";
import { BindParameter } from "./dbCommand";
import { DBConnection } from "./dbConnection";
import { DBMapping } from "./dbMapping";

type SqliteCommand = CS.Mono.Data.Sqlite.SqliteCommand;
type SqliteDataReader = CS.Mono.Data.Sqlite.SqliteDataReader;
const ConnectionState = CS.System.Data.ConnectionState;

class DBCommandInsert {
    commandText: string;
    private _conn: DBConnection;
    private _command: SqliteCommand;

    constructor(conn: DBConnection) {
        this._conn = conn;
        this.commandText = "";
    }
    isConnect(conn: DBConnection) {
        return this._conn === conn;
    }
    isValid() {
        return this._conn && this._conn.opened && this._conn.handle.State !== ConnectionState.Closed;
    }
    executeUpdate(objs: any[]) {
        if (this._conn.trace) {
            console.log(this.commandText + "\nBindings:" + objs);
        }

        if (!this._command)
            this._command = this.prepare();
        //bind the values.
        this._command.Parameters.Clear();
        if (objs)
            objs.forEach(val => BindParameter(this._command, val));

        return this._command.ExecuteNonQuery();
    }
    dispose() {
        let command = this._command;
        this._command = null;
        if (command) {
            command.Cancel();
            command.Dispose();
        }
    }
    private prepare(): SqliteCommand {
        var command = new CS.Mono.Data.Sqlite.SqliteCommand(this.commandText, this._conn.handle);
        command.Prepare();
        return command;
    }
}

export {
    DBCommandInsert,
}