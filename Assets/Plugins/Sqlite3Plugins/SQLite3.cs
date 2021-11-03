#if WINDOWS_PHONE && !USE_WP8_NATIVE_SQLITE
#define USE_CSHARP_SQLITE
#endif

using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using System.Reflection;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;

#if USE_CSHARP_SQLITE
using Sqlite3 = Community.CsharpSqlite.Sqlite3;
using Sqlite3DatabaseHandle = Community.CsharpSqlite.Sqlite3.sqlite3;
using Sqlite3Statement = Community.CsharpSqlite.Sqlite3.Vdbe;
#elif USE_WP8_NATIVE_SQLITE
using Sqlite3 = Sqlite.Sqlite3;
using Sqlite3DatabaseHandle = Sqlite.Database;
using Sqlite3Statement = Sqlite.Statement;
#else
using Sqlite3DatabaseHandle = System.IntPtr;
using Sqlite3Statement = System.IntPtr;
#endif

namespace SQLite
{
    public class SQLiteConnection : IDisposable
    {
        private bool _open;
        private TimeSpan _busyTimeout;
        private System.Diagnostics.Stopwatch _sw;
        private TimeSpan _elapsed = default(TimeSpan);

        private int _transactionDepth = 0;
        private Random _rand = new Random();

        public Sqlite3DatabaseHandle Handle { get; private set; }
        internal static readonly Sqlite3DatabaseHandle NullHandle = default(Sqlite3DatabaseHandle);

        public string DatabasePath { get; private set; }

        public bool Connected { get { return _open && _open && Handle != NullHandle; } }

        // Dictionary of synchronization objects.
        //
        // To prevent database disruption, a database file must be accessed *synchronously*.
        // For the purpose we create synchronous objects for each database file and store in the
        // static dictionary to share it among all connections.
        // The key of the dictionary is database file path and its value is an object to be used
        // by lock() statement.
        //
        // Use case:
        // - database file lock is done implicitly and automatically.
        // - To prepend deadlock, application may lock a database file explicity by either way:
        //   - RunInTransaction(Action) locks the database during the transaction (for insert/update)
        //   - RunInDatabaseLock(Action) similarly locks the database but no transaction (for query)
        private static Dictionary<string, object> syncObjects = new Dictionary<string, object>();
        /// <summary>
        /// Gets the synchronous object, to be lock the database file for updating.
        /// </summary>
        /// <value>The sync object.</value>
        public object SyncObject { get { return syncObjects[DatabasePath]; } }


        public SQLiteConnection(string databasePath) : this(databasePath, SQLiteOpenFlags.ReadWrite | SQLiteOpenFlags.Create)
        {
        }
        public SQLiteConnection(string databasePath, SQLiteOpenFlags openFlags)
        {
            if (string.IsNullOrEmpty(databasePath))
                throw new ArgumentException("Must be specified", "databasePath");

            DatabasePath = databasePath;
            MayCreateSyncObject(databasePath);

#if NETFX_CORE
			SQLite3.SetDirectory(/*temp directory type*/2, Windows.Storage.ApplicationData.Current.TemporaryFolder.Path);
#endif

            Sqlite3DatabaseHandle handle;

#if SILVERLIGHT || USE_CSHARP_SQLITE
			var r = SQLite3.Open(databasePath, out handle, (int)openFlags, IntPtr.Zero);
#else
            // open using the byte[]
            // in the case where the path may include Unicode
            // force open to using UTF-8 using sqlite3_open_v2
            var databasePathAsBytes = GetNullTerminatedUtf8(DatabasePath);
            var r = SQLite3.Open(databasePathAsBytes, out handle, (int)openFlags, IntPtr.Zero);
#endif

            Handle = handle;
            if (r != SQLite3.Result.OK)
            {
                throw SQLiteException.New(r, String.Format("Could not open database file: {0} ({1})", DatabasePath, r));
            }
            _open = true;

            BusyTimeout = TimeSpan.FromSeconds(0.1);
        }

        private void MayCreateSyncObject(string databasePath)
        {
            if (!syncObjects.ContainsKey(databasePath))
            {
                syncObjects[databasePath] = new object();
            }
        }

        public void EnableLoadExtension(int onoff)
        {
            SQLite3.Result r = SQLite3.EnableLoadExtension(Handle, onoff);
            if (r != SQLite3.Result.OK)
            {
                string msg = SQLite3.GetErrmsg(Handle);
                throw SQLiteException.New(r, msg);
            }
        }
        static byte[] GetNullTerminatedUtf8(string s)
        {
            var utf8Length = System.Text.Encoding.UTF8.GetByteCount(s);
            var bytes = new byte[utf8Length + 1];
            utf8Length = System.Text.Encoding.UTF8.GetBytes(s, 0, s.Length, bytes, 0);
            return bytes;
        }

        /// <summary>
        /// Sets a busy handler to sleep the specified amount of time when a table is locked.
        /// The handler will sleep multiple times until a total time of <see cref="BusyTimeout"/> has accumulated.
        /// </summary>
        public TimeSpan BusyTimeout
        {
            get { return _busyTimeout; }
            set
            {
                _busyTimeout = value;
                if (Handle != NullHandle)
                {
                    SQLite3.BusyTimeout(Handle, (int)_busyTimeout.TotalMilliseconds);
                }
            }
        }

        /// <summary>
        /// Creates an index for the specified table and columns.
        /// </summary>
        /// <param name="indexName">Name of the index to create</param>
        /// <param name="tableName">Name of the database table</param>
        /// <param name="columnNames">An array of column names to index</param>
        /// <param name="unique">Whether the index should be unique</param>
        public int CreateIndex(string indexName, string tableName, string[] columnNames, bool unique = false)
        {
            const string sqlFormat = "create {2} index if not exists \"{3}\" on \"{0}\"(\"{1}\")";
            var sql = String.Format(sqlFormat, tableName, string.Join("\", \"", columnNames), unique ? "unique" : "", indexName);
            return Execute(sql);
        }

        /// <summary>
        /// Creates an index for the specified table and column.
        /// </summary>
        /// <param name="indexName">Name of the index to create</param>
        /// <param name="tableName">Name of the database table</param>
        /// <param name="columnName">Name of the column to index</param>
        /// <param name="unique">Whether the index should be unique</param>
        public int CreateIndex(string indexName, string tableName, string columnName, bool unique = false)
        {
            return CreateIndex(indexName, tableName, new string[] { columnName }, unique);
        }

        /// <summary>
        /// Creates an index for the specified table and column.
        /// </summary>
        /// <param name="tableName">Name of the database table</param>
        /// <param name="columnName">Name of the column to index</param>
        /// <param name="unique">Whether the index should be unique</param>
        public int CreateIndex(string tableName, string columnName, bool unique = false)
        {
            return CreateIndex(tableName + "_" + columnName, tableName, columnName, unique);
        }

        /// <summary>
        /// Creates an index for the specified table and columns.
        /// </summary>
        /// <param name="tableName">Name of the database table</param>
        /// <param name="columnNames">An array of column names to index</param>
        /// <param name="unique">Whether the index should be unique</param>
        public int CreateIndex(string tableName, string[] columnNames, bool unique = false)
        {
            return CreateIndex(tableName + "_" + string.Join("_", columnNames), tableName, columnNames, unique);
        }

        /// <summary>
        /// Creates a new SQLiteCommand. Can be overridden to provide a sub-class.
        /// </summary>
        /// <seealso cref="SQLiteCommand.OnInstanceCreated"/>
        protected virtual SQLiteCommand NewCommand()
        {
            return new SQLiteCommand(this);
        }

        /// <summary>
        /// Creates a new SQLiteCommand given the command text with arguments. Place a '?'
        /// in the command text for each of the arguments.
        /// </summary>
        /// <param name="cmdText">
        /// The fully escaped SQL.
        /// </param>
        /// <param name="args">
        /// Arguments to substitute for the occurences of '?' in the command text.
        /// </param>
        /// <returns>
        /// A <see cref="SQLiteCommand"/>
        /// </returns>
        public SQLiteCommand CreateCommand(string cmdText, params object[] ps)
        {
            if (!_open)
                throw SQLiteException.New(SQLite3.Result.Error, "Cannot create commands from unopened database");

            var cmd = NewCommand();
            cmd.CommandText = cmdText;
            foreach (var o in ps)
            {
                cmd.Bind(o);
            }
            return cmd;
        }

        /// <summary>
        /// Creates a SQLiteCommand given the command text (SQL) with arguments. Place a '?'
        /// in the command text for each of the arguments and then executes that command.
        /// Use this method instead of Query when you don't expect rows back. Such cases include
        /// INSERTs, UPDATEs, and DELETEs.
        /// You can set the Trace or TimeExecution properties of the connection
        /// to profile execution.
        /// </summary>
        /// <param name="query">
        /// The fully escaped SQL.
        /// </param>
        /// <param name="args">
        /// Arguments to substitute for the occurences of '?' in the query.
        /// </param>
        /// <returns>
        /// The number of rows modified in the database as a result of this execution.
        /// </returns>
        public int Execute(string query, params object[] args)
        {
            var cmd = CreateCommand(query, args);
            var r = cmd.ExecuteNonQuery();
            return r;
        }

        /// <summary>
        /// Whether <see cref="BeginTransaction"/> has been called and the database is waiting for a <see cref="Commit"/>.
        /// </summary>
        public bool IsInTransaction
        {
            get { return _transactionDepth > 0; }
        }

        public void BeginTransaction()
        {
            if (Interlocked.CompareExchange(ref _transactionDepth, 1, 0) == 0)
            {
                try
                {
                    Execute("begin transaction");
                }
                catch (Exception ex)
                {
                    var sqlExp = ex as SQLiteException;
                    if (sqlExp != null)
                    {
                        // It is recommended that applications respond to the errors listed below 
                        //    by explicitly issuing a ROLLBACK command.
                        // TODO: This rollback failsafe should be localized to all throw sites.
                        switch (sqlExp.Result)
                        {
                            case SQLite3.Result.IOError:
                            case SQLite3.Result.Full:
                            case SQLite3.Result.Busy:
                            case SQLite3.Result.NoMem:
                            case SQLite3.Result.Interrupt:
                                RollbackTo(null, true);
                                break;
                        }
                    }
                    else
                    {
                        // Call decrement and not VolatileWrite in case we've already 
                        //    created a transaction point in SaveTransactionPoint since the catch.
                        Interlocked.Decrement(ref _transactionDepth);
                    }

                    throw;
                }
            }
            else
            {
                // Calling BeginTransaction on an already open transaction is invalid
                throw new InvalidOperationException("Cannot begin a transaction while already in a transaction.");
            }
        }
        public void Commit()
        {
            if (Interlocked.Exchange(ref _transactionDepth, 0) != 0)
            {
                Execute("commit");
            }
        }

        public string SaveTransactionPoint()
        {
            int depth = Interlocked.Increment(ref _transactionDepth) - 1;
            string retVal = "S" + _rand.Next(short.MaxValue) + "D" + depth;

            try
            {
                Execute("savepoint " + retVal);
            }
            catch (Exception ex)
            {
                var sqlExp = ex as SQLiteException;
                if (sqlExp != null)
                {
                    // It is recommended that applications respond to the errors listed below 
                    //    by explicitly issuing a ROLLBACK command.
                    // TODO: This rollback failsafe should be localized to all throw sites.
                    switch (sqlExp.Result)
                    {
                        case SQLite3.Result.IOError:
                        case SQLite3.Result.Full:
                        case SQLite3.Result.Busy:
                        case SQLite3.Result.NoMem:
                        case SQLite3.Result.Interrupt:
                            RollbackTo(null, true);
                            break;
                    }
                }
                else
                {
                    Interlocked.Decrement(ref _transactionDepth);
                }

                throw;
            }

            return retVal;
        }
        public void Rollback()
        {
            RollbackTo(null, false);
        }
        public void RollbackTo(string savepoint)
        {
            RollbackTo(savepoint, false);
        }
        void RollbackTo(string savepoint, bool noThrow)
        {
            // Rolling back without a TO clause rolls backs all transactions 
            //    and leaves the transaction stack empty.   
            try
            {
                if (String.IsNullOrEmpty(savepoint))
                {
                    if (Interlocked.Exchange(ref _transactionDepth, 0) > 0)
                    {
                        Execute("rollback");
                    }
                }
                else
                {
                    DoSavePointExecute(savepoint, "rollback to ");
                }
            }
            catch (SQLiteException)
            {
                if (!noThrow)
                    throw;

            }
            // No need to rollback if there are no transactions open.
        }

        public void Release(string savepoint)
        {
            DoSavePointExecute(savepoint, "release ");
        }
        void DoSavePointExecute(string savepoint, string cmd)
        {
            // Validate the savepoint
            int firstLen = savepoint.IndexOf('D');
            if (firstLen >= 2 && savepoint.Length > firstLen + 1)
            {
                int depth;
                if (Int32.TryParse(savepoint.Substring(firstLen + 1), out depth))
                {
                    // TODO: Mild race here, but inescapable without locking almost everywhere.
                    if (0 <= depth && depth < _transactionDepth)
                    {
#if NETFX_CORE
						Volatile.Write (ref _transactionDepth, depth);
#elif SILVERLIGHT
						_transactionDepth = depth;
#else
                        Thread.VolatileWrite(ref _transactionDepth, depth);
#endif
                        Execute(cmd + savepoint);
                        return;
                    }
                }
            }

            throw new ArgumentException("savePoint is not valid, and should be the result of a call to SaveTransactionPoint.", "savePoint");
        }

        public void RunInTransaction(Action action)
        {
            try
            {
                lock (syncObjects[DatabasePath])
                {
                    var savePoint = SaveTransactionPoint();
                    action();
                    Release(savePoint);
                }
            }
            catch (Exception)
            {
                Rollback();
                throw;
            }
        }
        public void RunInDatabaseLock(Action action)
        {
            lock (syncObjects[DatabasePath])
            {
                action();
            }
        }

        ~SQLiteConnection()
        {
            Dispose(false);
        }

        public void Dispose()
        {
            Dispose(true);
            GC.SuppressFinalize(this);
        }

        protected virtual void Dispose(bool disposing)
        {
            Close();
        }

        public void Close()
        {
            if (_open && Handle != NullHandle)
            {
                try
                {
                    var r = SQLite3.Close(Handle);
                    if (r != SQLite3.Result.OK)
                    {
                        string msg = SQLite3.GetErrmsg(Handle);
                        throw SQLiteException.New(r, msg);
                    }
                }
                finally
                {
                    Handle = NullHandle;
                    _open = false;
                }
            }
        }
    }
    public class SQLiteCommand
    {
        SQLiteConnection _conn;
        private List<Binding> _bindings;

        public string CommandText { get; set; }

        public SQLiteCommand(SQLiteConnection conn)
        {
            _conn = conn;
            _bindings = new List<Binding>();
            CommandText = "";
        }

        public int ExecuteNonQuery()
        {
            var r = SQLite3.Result.OK;
            lock (_conn.SyncObject)
            {
                var stmt = Prepare();
                r = SQLite3.Step(stmt);
                Finalize(stmt);
            }
            if (r == SQLite3.Result.Done)
            {
                int rowsAffected = SQLite3.Changes(_conn.Handle);
                return rowsAffected;
            }
            else if (r == SQLite3.Result.Error)
            {
                string msg = SQLite3.GetErrmsg(_conn.Handle);
                throw SQLiteException.New(r, msg);
            }
            else if (r == SQLite3.Result.Constraint)
            {
                if (SQLite3.ExtendedErrCode(_conn.Handle) == SQLite3.ExtendedResult.ConstraintNotNull)
                {
                    throw SQLiteException.New(r, SQLite3.GetErrmsg(_conn.Handle));
                }
            }

            throw SQLiteException.New(r, r.ToString());
        }

        public SQLiteReader ExecuteReader()
        {
            lock (_conn.SyncObject)
            {
                var stmt = Prepare();
                return new SQLiteReader(this._conn, stmt);
            }
        }
        public T ExecuteScalar<T>()
        {
            var val = ExecuteScalar(typeof(T));
            return val != null ? (T)val : default;
        }
        public object ExecuteScalar(Type type)
        {
            object val = default;

            lock (_conn.SyncObject)
            {
                var stmt = Prepare();
                try
                {
                    var r = SQLite3.Step(stmt);
                    if (r == SQLite3.Result.Row)
                    {
                        var colType = SQLite3.ColumnType(stmt, 0);
                        val = SQLiteReader.ReadCol(stmt, 0, colType, type);
                    }
                    else if (r == SQLite3.Result.Done)
                    {
                    }
                    else
                    {
                        throw SQLiteException.New(r, SQLite3.GetErrmsg(_conn.Handle));
                    }
                }
                finally
                {
                    Finalize(stmt);
                }
            }

            return val;
        }

        public void Bind(string name, object val)
        {
            _bindings.Add(new Binding
            {
                Name = name,
                Value = val
            });
        }
        public void Bind(object val)
        {
            Bind(null, val);
        }
        public void ClearBind()
        {
            this._bindings.Clear();
        }

        private Sqlite3Statement Prepare()
        {
            var stmt = SQLite3.Prepare2(_conn.Handle, CommandText);
            BindAll(stmt);
            return stmt;
        }

        private void Finalize(Sqlite3Statement stmt)
        {
            SQLite3.Finalize(stmt);
        }

        private void BindAll(Sqlite3Statement stmt)
        {
            int nextIdx = 1;
            foreach (var b in _bindings)
            {
                if (b.Name != null)
                {
                    b.Index = SQLite3.BindParameterIndex(stmt, b.Name);
                }
                else
                {
                    b.Index = nextIdx++;
                }

                BindParameter(stmt, b.Index, b.Value);
            }
        }

        internal static IntPtr NegativePointer = new IntPtr(-1);

        internal static void BindParameter(Sqlite3Statement stmt, int index, object value)
        {
            if (value == null)
            {
                SQLite3.BindNull(stmt, index);
            }
            else
            {
                if (value is Int32)
                {
                    SQLite3.BindInt(stmt, index, (int)value);
                }
                else if (value is String)
                {
                    SQLite3.BindText(stmt, index, (string)value, -1, NegativePointer);
                }
                else if (value is Byte || value is UInt16 || value is SByte || value is Int16)
                {
                    SQLite3.BindInt(stmt, index, Convert.ToInt32(value));
                }
                else if (value is Boolean)
                {
                    SQLite3.BindInt(stmt, index, (bool)value ? 1 : 0);
                }
                else if (value is UInt32 || value is Int64)
                {
                    SQLite3.BindInt64(stmt, index, Convert.ToInt64(value));
                }
                else if (value is Single || value is Double || value is Decimal)
                {
                    SQLite3.BindDouble(stmt, index, Convert.ToDouble(value));
                }
                else if (value is TimeSpan)
                {
                    SQLite3.BindInt64(stmt, index, ((TimeSpan)value).Ticks);
                }
                else if (value is DateTime)
                {
                    SQLite3.BindText(stmt, index, ((DateTime)value).ToString("yyyy-MM-dd HH:mm:ss"), -1, NegativePointer);
                }
                else if (value is DateTimeOffset)
                {
                    SQLite3.BindInt64(stmt, index, ((DateTimeOffset)value).UtcTicks);
#if !NETFX_CORE
                }
                else if (value.GetType().IsEnum)
                {
#else
				} else if (value.GetType().GetTypeInfo().IsEnum) {
#endif
                    SQLite3.BindInt(stmt, index, Convert.ToInt32(value));
                }
                else if (value is byte[])
                {
                    SQLite3.BindBlob(stmt, index, (byte[])value, ((byte[])value).Length, NegativePointer);
                }
                else if (value is Guid)
                {
                    SQLite3.BindText(stmt, index, ((Guid)value).ToString(), 72, NegativePointer);
                }
                else
                {
                    throw new NotSupportedException("Cannot store type: " + value.GetType());
                }
            }
        }

        class Binding
        {
            public string Name { get; set; }

            public object Value { get; set; }

            public int Index { get; set; }
        }
    }
    public class SQLiteReader : IDisposable
    {
        private SQLiteConnection conn;
        private Sqlite3DatabaseHandle stmt;
        private string[] columnNames;

        internal SQLiteReader(SQLiteConnection conn, Sqlite3DatabaseHandle stmt)
        {
            this.conn = conn;
            this.stmt = stmt;
        }

        public void Close()
        {
            this.Dispose();
        }

        public void Dispose()
        {
            if (this.stmt != SQLiteConnection.NullHandle)
            {
                lock (conn.SyncObject)
                {
                    if (this.stmt != SQLiteConnection.NullHandle)
                    {
                        try
                        {
                            SQLite3.Finalize(stmt);
                        }
                        finally
                        {
                            this.stmt = SQLiteConnection.NullHandle;
                        }
                    }
                }
            }
        }

        public bool Read()
        {
            Exception exception = null;
            lock (conn.SyncObject)
            {
                if (this.stmt != SQLiteConnection.NullHandle)
                {
                    try
                    {
                        return SQLite3.Step(stmt) == SQLite3.Result.Row;
                    }
                    catch (Exception e)
                    {
                        exception = e;
                    }
                }
            }
            if (exception != null)
            {
                this.Dispose();
                throw exception;
            }
            return false;
        }
        public object GetValue(int ordinal, Type targetType = null)
        {
            Exception exception = null;
            lock (conn.SyncObject)
            {
                if (this.stmt != SQLiteConnection.NullHandle && ordinal >= 0)
                {
                    try
                    {
                        var colType = SQLite3.ColumnType(stmt, ordinal);
                        return ReadCol(this.stmt, ordinal, colType, targetType);
                    }
                    catch (Exception e)
                    {
                        exception = e;
                    }
                }
            }
            if (exception != null)
            {
                this.Dispose();
                throw exception;
            }
            return null;
        }
        public T GetValue<T>(int ordinal)
        {
            var result = this.GetValue(ordinal, typeof(T));
            return result != null ? (T)result : default;
        }
        public byte GetByte(int ordinal)
        {
            return GetValue<byte>(ordinal);
        }
        public byte[] GetBytes(int ordinal)
        {
            return GetValue<byte[]>(ordinal);
        }
        public string GetString(int ordinal)
        {
            return GetValue<string>(ordinal);
        }
        public Int16 GetInt16(int ordinal)
        {
            return GetValue<Int16>(ordinal);
        }
        public Int32 GetInt32(int ordinal)
        {
            return GetValue<Int32>(ordinal);
        }
        public Int64 GetInt64(int ordinal)
        {
            return GetValue<Int64>(ordinal);
        }
        public decimal GetDecimal(int ordinal)
        {
            return GetValue<decimal>(ordinal);
        }
        public bool GetBoolean(int ordinal)
        {
            return GetValue<bool>(ordinal);
        }
        public float GetFloat(int ordinal)
        {
            return GetValue<float>(ordinal);
        }
        public double GetDouble(int ordinal)
        {
            return GetValue<double>(ordinal);
        }
        public DateTime GetDateTime(int ordinal)
        {
            return GetValue<DateTime>(ordinal);
        }
        public TimeSpan GetTimeSpan(int ordinal)
        {
            return GetValue<TimeSpan>(ordinal);
        }
        public DateTimeOffset GetDateTimeOffset(int ordinal)
        {
            return GetValue<DateTimeOffset>(ordinal);
        }
        public Guid GetGuid(int ordinal)
        {
            return GetValue<Guid>(ordinal);
        }

        public int ColumnLength()
        {
            if (this.columnNames == null)
            {
                Exception exception = null;
                lock (conn.SyncObject)
                {
                    if (this.stmt != SQLiteConnection.NullHandle && this.columnNames == null)
                    {
                        try
                        {
                            var cols = this.columnNames = new string[SQLite3.ColumnCount(stmt)];
                            for (var i = 0; i < cols.Length; i++)
                            {
                                cols[i] = SQLite3.ColumnName16(stmt, i);
                            }
                        }
                        catch (Exception e)
                        {
                            exception = e;
                            this.columnNames = new string[0];
                        }
                    }
                }
                if (exception != null)
                {
                    this.Dispose();
                    throw exception;
                }

            }
            if (this.columnNames != null)
                return this.columnNames.Length;

            return 0;
        }
        public int GetOrdinal(string columnName)
        {
            if (this.columnNames == null)
            {
                this.ColumnLength();
            }
            if (this.columnNames != null)
            {
                return Array.IndexOf(this.columnNames, columnName);
            }
            return -1;
        }
        public string GetName(int ordinal)
        {
            if (this.columnNames == null)
            {
                this.ColumnLength();
            }
            if (this.columnNames != null && ordinal >= 0 && ordinal < this.columnNames.Length)
            {
                return this.columnNames[ordinal];
            }
            return null;
        }

        public SQLite3.ColType GetDBType(int ordinal)
        {
            Exception exception = null;
            lock (conn.SyncObject)
            {
                if (this.stmt != SQLiteConnection.NullHandle && ordinal >= 0)
                {
                    try
                    {
                        return SQLite3.ColumnType(stmt, ordinal);
                    }
                    catch (Exception e)
                    {
                        exception = e;
                    }
                }
            }
            if (exception != null)
            {
                this.Dispose();
                throw exception;
            }
            return default;
        }
        public bool IsDBNull(int ordinal)
        {
            return this.GetDBType(ordinal) == SQLite3.ColType.Null;
        }

        public static object ReadCol(Sqlite3Statement stmt, int index, SQLite3.ColType type, Type targetType)
        {
            if (type == SQLite3.ColType.Null)
            {
                return null;
            }
            if (targetType == null)
            {
                switch (type)
                {
                    case SQLite3.ColType.Integer:
                        return SQLite3.ColumnInt(stmt, index);
                    case SQLite3.ColType.Float:
                        return (float)SQLite3.ColumnDouble(stmt, index);
                    case SQLite3.ColType.Text:
                        return SQLite3.ColumnString(stmt, index);
                    case SQLite3.ColType.Blob:
                        return SQLite3.ColumnByteArray(stmt, index);
                }
            }
            else
            {
                if (targetType == typeof(String))
                {
                    return SQLite3.ColumnString(stmt, index);
                }
                else if (targetType == typeof(Int32))
                {
                    return (int)SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(Boolean))
                {
                    return SQLite3.ColumnInt(stmt, index) == 1;
                }
                else if (targetType == typeof(double))
                {
                    return SQLite3.ColumnDouble(stmt, index);
                }
                else if (targetType == typeof(float))
                {
                    return (float)SQLite3.ColumnDouble(stmt, index);
                }
                else if (targetType == typeof(TimeSpan))
                {
                    return new TimeSpan(SQLite3.ColumnInt64(stmt, index));
                }
                else if (targetType == typeof(DateTime))
                {
                    var text = SQLite3.ColumnString(stmt, index);
                    return DateTime.Parse(text);
                }
                else if (targetType == typeof(DateTimeOffset))
                {
                    return new DateTimeOffset(SQLite3.ColumnInt64(stmt, index), TimeSpan.Zero);
#if !NETFX_CORE
                }
                else if (targetType.IsEnum)
                {
#else
				} else if (clrType.GetTypeInfo().IsEnum) {
#endif
                    return SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(Int64))
                {
                    return SQLite3.ColumnInt64(stmt, index);
                }
                else if (targetType == typeof(UInt32))
                {
                    return (uint)SQLite3.ColumnInt64(stmt, index);
                }
                else if (targetType == typeof(decimal))
                {
                    return (decimal)SQLite3.ColumnDouble(stmt, index);
                }
                else if (targetType == typeof(Byte))
                {
                    return (byte)SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(UInt16))
                {
                    return (ushort)SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(Int16))
                {
                    return (short)SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(sbyte))
                {
                    return (sbyte)SQLite3.ColumnInt(stmt, index);
                }
                else if (targetType == typeof(byte[]))
                {
                    return SQLite3.ColumnByteArray(stmt, index);
                }
                else if (targetType == typeof(Guid))
                {
                    var text = SQLite3.ColumnString(stmt, index);
                    return new Guid(text);
                }
            }
            throw new NotSupportedException("Don't know how to read " + targetType);
        }
    }

    [Flags]
    public enum SQLiteOpenFlags
    {
        ReadOnly = 1,
        ReadWrite = 2,
        Create = 4,
        NoMutex = 0x8000,
        FullMutex = 0x10000,
        SharedCache = 0x20000,
        PrivateCache = 0x40000,
        ProtectionComplete = 0x00100000,
        ProtectionCompleteUnlessOpen = 0x00200000,
        ProtectionCompleteUntilFirstUserAuthentication = 0x00300000,
        ProtectionNone = 0x00400000
    }
    public class SQLiteException : Exception
    {
        public SQLite3.Result Result { get; private set; }

        protected SQLiteException(SQLite3.Result r, string message) : base(message)
        {
            Result = r;
        }
        public static SQLiteException New(SQLite3.Result r, string message)
        {
            return new SQLiteException(r, message);
        }
    }
    public static class SQLite3
    {
        public enum Result : int
        {
            OK = 0,
            Error = 1,
            Internal = 2,
            Perm = 3,
            Abort = 4,
            Busy = 5,
            Locked = 6,
            NoMem = 7,
            ReadOnly = 8,
            Interrupt = 9,
            IOError = 10,
            Corrupt = 11,
            NotFound = 12,
            Full = 13,
            CannotOpen = 14,
            LockErr = 15,
            Empty = 16,
            SchemaChngd = 17,
            TooBig = 18,
            Constraint = 19,
            Mismatch = 20,
            Misuse = 21,
            NotImplementedLFS = 22,
            AccessDenied = 23,
            Format = 24,
            Range = 25,
            NonDBFile = 26,
            Notice = 27,
            Warning = 28,
            Row = 100,
            Done = 101
        }

        public enum ExtendedResult : int
        {
            IOErrorRead = (Result.IOError | (1 << 8)),
            IOErrorShortRead = (Result.IOError | (2 << 8)),
            IOErrorWrite = (Result.IOError | (3 << 8)),
            IOErrorFsync = (Result.IOError | (4 << 8)),
            IOErrorDirFSync = (Result.IOError | (5 << 8)),
            IOErrorTruncate = (Result.IOError | (6 << 8)),
            IOErrorFStat = (Result.IOError | (7 << 8)),
            IOErrorUnlock = (Result.IOError | (8 << 8)),
            IOErrorRdlock = (Result.IOError | (9 << 8)),
            IOErrorDelete = (Result.IOError | (10 << 8)),
            IOErrorBlocked = (Result.IOError | (11 << 8)),
            IOErrorNoMem = (Result.IOError | (12 << 8)),
            IOErrorAccess = (Result.IOError | (13 << 8)),
            IOErrorCheckReservedLock = (Result.IOError | (14 << 8)),
            IOErrorLock = (Result.IOError | (15 << 8)),
            IOErrorClose = (Result.IOError | (16 << 8)),
            IOErrorDirClose = (Result.IOError | (17 << 8)),
            IOErrorSHMOpen = (Result.IOError | (18 << 8)),
            IOErrorSHMSize = (Result.IOError | (19 << 8)),
            IOErrorSHMLock = (Result.IOError | (20 << 8)),
            IOErrorSHMMap = (Result.IOError | (21 << 8)),
            IOErrorSeek = (Result.IOError | (22 << 8)),
            IOErrorDeleteNoEnt = (Result.IOError | (23 << 8)),
            IOErrorMMap = (Result.IOError | (24 << 8)),
            LockedSharedcache = (Result.Locked | (1 << 8)),
            BusyRecovery = (Result.Busy | (1 << 8)),
            CannottOpenNoTempDir = (Result.CannotOpen | (1 << 8)),
            CannotOpenIsDir = (Result.CannotOpen | (2 << 8)),
            CannotOpenFullPath = (Result.CannotOpen | (3 << 8)),
            CorruptVTab = (Result.Corrupt | (1 << 8)),
            ReadonlyRecovery = (Result.ReadOnly | (1 << 8)),
            ReadonlyCannotLock = (Result.ReadOnly | (2 << 8)),
            ReadonlyRollback = (Result.ReadOnly | (3 << 8)),
            AbortRollback = (Result.Abort | (2 << 8)),
            ConstraintCheck = (Result.Constraint | (1 << 8)),
            ConstraintCommitHook = (Result.Constraint | (2 << 8)),
            ConstraintForeignKey = (Result.Constraint | (3 << 8)),
            ConstraintFunction = (Result.Constraint | (4 << 8)),
            ConstraintNotNull = (Result.Constraint | (5 << 8)),
            ConstraintPrimaryKey = (Result.Constraint | (6 << 8)),
            ConstraintTrigger = (Result.Constraint | (7 << 8)),
            ConstraintUnique = (Result.Constraint | (8 << 8)),
            ConstraintVTab = (Result.Constraint | (9 << 8)),
            NoticeRecoverWAL = (Result.Notice | (1 << 8)),
            NoticeRecoverRollback = (Result.Notice | (2 << 8))
        }

        public enum ConfigOption : int

        {
            SingleThread = 1,
            MultiThread = 2,
            Serialized = 3
        }

        const string DLLNAME = "sqlite3";

#if !USE_CSHARP_SQLITE && !USE_WP8_NATIVE_SQLITE
        [DllImport(DLLNAME, EntryPoint = "sqlite3_open", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Open([MarshalAs(UnmanagedType.LPStr)] string filename, out IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_open_v2", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Open([MarshalAs(UnmanagedType.LPStr)] string filename, out IntPtr db, int flags, IntPtr zvfs);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_open_v2", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Open(byte[] filename, out IntPtr db, int flags, IntPtr zvfs);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_open16", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Open16([MarshalAs(UnmanagedType.LPWStr)] string filename, out IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_enable_load_extension", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result EnableLoadExtension(IntPtr db, int onoff);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_close", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Close(IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_initialize", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Initialize();

        [DllImport(DLLNAME, EntryPoint = "sqlite3_shutdown", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Shutdown();

        [DllImport(DLLNAME, EntryPoint = "sqlite3_config", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Config(ConfigOption option);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_win32_set_directory", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode)]
        public static extern int SetDirectory(uint directoryType, string directoryPath);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_busy_timeout", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result BusyTimeout(IntPtr db, int milliseconds);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_changes", CallingConvention = CallingConvention.Cdecl)]
        public static extern int Changes(IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_prepare_v2", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Prepare2(IntPtr db, [MarshalAs(UnmanagedType.LPStr)] string sql, int numBytes, out IntPtr stmt, IntPtr pzTail);

#if NETFX_CORE
		[DllImport (DLLNAME, EntryPoint = "sqlite3_prepare_v2", CallingConvention = CallingConvention.Cdecl)]
		public static extern Result Prepare2 (IntPtr db, byte[] queryBytes, int numBytes, out IntPtr stmt, IntPtr pzTail);
#endif

        public static IntPtr Prepare2(IntPtr db, string query)
        {
            IntPtr stmt;
#if NETFX_CORE
			byte[] queryBytes = System.Text.UTF8Encoding.UTF8.GetBytes (query);
			var r = Prepare2 (db, queryBytes, queryBytes.Length, out stmt, IntPtr.Zero);
#else
            var r = Prepare2(db, query, System.Text.UTF8Encoding.UTF8.GetByteCount(query), out stmt, IntPtr.Zero);
#endif
            if (r != Result.OK)
            {
                throw SQLiteException.New(r, GetErrmsg(db));
            }
            return stmt;
        }

        [DllImport(DLLNAME, EntryPoint = "sqlite3_step", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Step(IntPtr stmt);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_reset", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Reset(IntPtr stmt);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_finalize", CallingConvention = CallingConvention.Cdecl)]
        public static extern Result Finalize(IntPtr stmt);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_last_insert_rowid", CallingConvention = CallingConvention.Cdecl)]
        public static extern long LastInsertRowid(IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_errmsg16", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr Errmsg(IntPtr db);

        public static string GetErrmsg(IntPtr db)
        {
            return Marshal.PtrToStringUni(Errmsg(db));
        }

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_parameter_index", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindParameterIndex(IntPtr stmt, [MarshalAs(UnmanagedType.LPStr)] string name);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_null", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindNull(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_int", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindInt(IntPtr stmt, int index, int val);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_int64", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindInt64(IntPtr stmt, int index, long val);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_double", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindDouble(IntPtr stmt, int index, double val);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_text16", CallingConvention = CallingConvention.Cdecl, CharSet = CharSet.Unicode)]
        public static extern int BindText(IntPtr stmt, int index, [MarshalAs(UnmanagedType.LPWStr)] string val, int n, IntPtr free);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_bind_blob", CallingConvention = CallingConvention.Cdecl)]
        public static extern int BindBlob(IntPtr stmt, int index, byte[] val, int n, IntPtr free);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_count", CallingConvention = CallingConvention.Cdecl)]
        public static extern int ColumnCount(IntPtr stmt);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_name", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr ColumnName(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_name16", CallingConvention = CallingConvention.Cdecl)]
        static extern IntPtr ColumnName16Internal(IntPtr stmt, int index);
        public static string ColumnName16(IntPtr stmt, int index)
        {
            return Marshal.PtrToStringUni(ColumnName16Internal(stmt, index));
        }

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_type", CallingConvention = CallingConvention.Cdecl)]
        public static extern ColType ColumnType(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_int", CallingConvention = CallingConvention.Cdecl)]
        public static extern int ColumnInt(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_int64", CallingConvention = CallingConvention.Cdecl)]
        public static extern long ColumnInt64(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_double", CallingConvention = CallingConvention.Cdecl)]
        public static extern double ColumnDouble(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_text", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr ColumnText(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_text16", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr ColumnText16(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_blob", CallingConvention = CallingConvention.Cdecl)]
        public static extern IntPtr ColumnBlob(IntPtr stmt, int index);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_column_bytes", CallingConvention = CallingConvention.Cdecl)]
        public static extern int ColumnBytes(IntPtr stmt, int index);

        public static string ColumnString(IntPtr stmt, int index)
        {
            return Marshal.PtrToStringUni(SQLite3.ColumnText16(stmt, index));
        }

        public static byte[] ColumnByteArray(IntPtr stmt, int index)
        {
            int length = ColumnBytes(stmt, index);
            var result = new byte[length];
            if (length > 0)
                Marshal.Copy(ColumnBlob(stmt, index), result, 0, length);
            return result;
        }

        [DllImport(DLLNAME, EntryPoint = "sqlite3_extended_errcode", CallingConvention = CallingConvention.Cdecl)]
        public static extern ExtendedResult ExtendedErrCode(IntPtr db);

        [DllImport(DLLNAME, EntryPoint = "sqlite3_libversion_number", CallingConvention = CallingConvention.Cdecl)]
        public static extern int LibVersionNumber();
#else
		public static Result Open(string filename, out Sqlite3DatabaseHandle db)
		{
			return (Result) Sqlite3.sqlite3_open(filename, out db);
		}

		public static Result Open(string filename, out Sqlite3DatabaseHandle db, int flags, IntPtr zVfs)
		{
#if USE_WP8_NATIVE_SQLITE
			return (Result)Sqlite3.sqlite3_open_v2(filename, out db, flags, "");
#else
			return (Result)Sqlite3.sqlite3_open_v2(filename, out db, flags, null);
#endif
		}

		public static Result Close(Sqlite3DatabaseHandle db)
		{
			return (Result)Sqlite3.sqlite3_close(db);
		}

		public static Result BusyTimeout(Sqlite3DatabaseHandle db, int milliseconds)
		{
			return (Result)Sqlite3.sqlite3_busy_timeout(db, milliseconds);
		}

		public static int Changes(Sqlite3DatabaseHandle db)
		{
			return Sqlite3.sqlite3_changes(db);
		}

		public static Sqlite3Statement Prepare2(Sqlite3DatabaseHandle db, string query)
		{
			Sqlite3Statement stmt = default(Sqlite3Statement);
#if USE_WP8_NATIVE_SQLITE
			var r = Sqlite3.sqlite3_prepare_v2(db, query, out stmt);
#else
			stmt = new Sqlite3Statement();
			var r = Sqlite3.sqlite3_prepare_v2(db, query, -1, ref stmt, 0);
#endif
			if (r != 0)
			{
				throw SQLiteException.New((Result)r, GetErrmsg(db));
			}
			return stmt;
		}

		public static Result Step(Sqlite3Statement stmt)
		{
			return (Result)Sqlite3.sqlite3_step(stmt);
		}

		public static Result Reset(Sqlite3Statement stmt)
		{
			return (Result)Sqlite3.sqlite3_reset(stmt);
		}

		public static Result Finalize(Sqlite3Statement stmt)
		{
			return (Result)Sqlite3.sqlite3_finalize(stmt);
		}

		public static long LastInsertRowid(Sqlite3DatabaseHandle db)
		{
			return Sqlite3.sqlite3_last_insert_rowid(db);
		}

		public static string GetErrmsg(Sqlite3DatabaseHandle db)
		{
			return Sqlite3.sqlite3_errmsg(db);
		}

		public static int BindParameterIndex(Sqlite3Statement stmt, string name)
		{
			return Sqlite3.sqlite3_bind_parameter_index(stmt, name);
		}

		public static int BindNull(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_bind_null(stmt, index);
		}

		public static int BindInt(Sqlite3Statement stmt, int index, int val)
		{
			return Sqlite3.sqlite3_bind_int(stmt, index, val);
		}

		public static int BindInt64(Sqlite3Statement stmt, int index, long val)
		{
			return Sqlite3.sqlite3_bind_int64(stmt, index, val);
		}

		public static int BindDouble(Sqlite3Statement stmt, int index, double val)
		{
			return Sqlite3.sqlite3_bind_double(stmt, index, val);
		}

		public static int BindText(Sqlite3Statement stmt, int index, string val, int n, IntPtr free)
		{
#if USE_WP8_NATIVE_SQLITE
			return Sqlite3.sqlite3_bind_text(stmt, index, val, n);
#else
			return Sqlite3.sqlite3_bind_text(stmt, index, val, n, null);
#endif
		}

		public static int BindBlob(Sqlite3Statement stmt, int index, byte[] val, int n, IntPtr free)
		{
#if USE_WP8_NATIVE_SQLITE
			return Sqlite3.sqlite3_bind_blob(stmt, index, val, n);
#else
			return Sqlite3.sqlite3_bind_blob(stmt, index, val, n, null);
#endif
		}

		public static int ColumnCount(Sqlite3Statement stmt)
		{
			return Sqlite3.sqlite3_column_count(stmt);
		}

		public static string ColumnName(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_name(stmt, index);
		}

		public static string ColumnName16(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_name(stmt, index);
		}

		public static ColType ColumnType(Sqlite3Statement stmt, int index)
		{
			return (ColType)Sqlite3.sqlite3_column_type(stmt, index);
		}

		public static int ColumnInt(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_int(stmt, index);
		}

		public static long ColumnInt64(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_int64(stmt, index);
		}

		public static double ColumnDouble(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_double(stmt, index);
		}

		public static string ColumnText(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_text(stmt, index);
		}

		public static string ColumnText16(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_text(stmt, index);
		}

		public static byte[] ColumnBlob(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_blob(stmt, index);
		}

		public static int ColumnBytes(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_bytes(stmt, index);
		}

		public static string ColumnString(Sqlite3Statement stmt, int index)
		{
			return Sqlite3.sqlite3_column_text(stmt, index);
		}

		public static byte[] ColumnByteArray(Sqlite3Statement stmt, int index)
		{
			return ColumnBlob(stmt, index);
		}

		public static Result EnableLoadExtension(Sqlite3DatabaseHandle db, int onoff)
		{
			return (Result)Sqlite3.sqlite3_enable_load_extension(db, onoff);
		}

		public static ExtendedResult ExtendedErrCode(Sqlite3DatabaseHandle db)
		{
			return (ExtendedResult)Sqlite3.sqlite3_extended_errcode(db);
		}
#endif

        public enum ColType : int
        {
            Integer = 1,
            Float = 2,
            Text = 3,
            Blob = 4,
            Null = 5
        }
    }
}