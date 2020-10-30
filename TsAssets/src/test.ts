import * as CS from "csharp";
import { DBConnection } from "./sqlite3/dbConnection";

//#region 
const log = console.log;
const err = console.error;
function join(arr: any[], separator: string) {
    let msg = "";
    for (let i = 0; i < arr.length; i++) {
        if (i > 0) msg += separator;
        msg += arr[i];
    }
    return msg;
}
function _log(...args: any[]) {
    let msg = join(args, ",") + "\n" + new Error().stack;
    log(msg);
}
function _error(...args: any[]) {

}
console.log = _log
console.error = _error
//#endregion


class A {
    a: number = 0;
    b: number = 0;
    c: string = "c";
    d: string = "d";
    e: string = "e";
}

function newObject() {
    let path = "C:/Users/Layer/Desktop/test.db";
    if (!CS.System.IO.File.Exists(path))
        DBConnection.createFile(path);

    let conn = new DBConnection(path);
    try {
        conn.trace = true;
        conn.open();

        let a = new A();
        a.a = CS.UnityEngine.Random.Range(1, 100);
        let count = conn.table<A>(A.prototype)
            .where(o => o.a == 1)
            .updateOrInsert(a);

        console.log(count);
    } finally {
        conn.dispose();
    }
}
export {
    newObject
}


