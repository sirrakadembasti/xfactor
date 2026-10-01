using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Diagnostics;

// Trusted runtime host. Project code runs only after assignment to its job.
internal static class WindowsProcessHost
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo {
        public uint cb; public string reserved, desktop, title;
        public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
        public ushort showWindow, reserved2Size; public IntPtr reserved2, stdin, stdout, stderr;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx { public StartupInfo startup; public IntPtr attributeList; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr process, thread; public uint processId, threadId; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimit {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorkingSet, maxWorkingSet; public uint activeProcessLimit;
        public UIntPtr affinity; public uint priority, scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong readOperations, writeOperations, otherOperations, readBytes, writeBytes, otherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimit {
        public BasicLimit basic; public IoCounters io;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObjectW(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimit info, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processAttributes, IntPtr threadAttributes, bool inheritHandles, uint flags, IntPtr environment, string directory, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr attributes, uint count, uint flags, ref UIntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr attributes, uint flags, IntPtr attribute, IntPtr value, UIntPtr size, IntPtr previous, IntPtr returnSize);
    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr attributes);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static void Require(bool ok) { if (!ok) throw new InvalidOperationException(); }
    private static string Quote(string value) {
        StringBuilder result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char character in value) {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
            else { result.Append('\\', slashes); result.Append(character); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
    }
    private static ulong Limit(string name) {
        string value = Environment.GetEnvironmentVariable(name);
        if (String.IsNullOrEmpty(value)) return 0;
        ulong result;
        Require(UInt64.TryParse(value, out result) && result > 0);
        return result;
    }
    public static int Main(string[] args) {
        IntPtr job = IntPtr.Zero; ProcessInfo process = new ProcessInfo(); bool completed = false;
        Process parent = null; IntPtr parentHandle = IntPtr.Zero;
        IntPtr attributes = IntPtr.Zero, jobList = IntPtr.Zero; bool attributesInitialized = false;
        try {
            Require(args.Length > 0 && Path.IsPathRooted(args[0]) && File.Exists(args[0]));
            ulong parentId = Limit("XFACTOR_LOCAL_PARENT_PID");
            if (parentId > 0) {
                Require(parentId <= Int32.MaxValue && parentId != (ulong)Process.GetCurrentProcess().Id);
                parent = Process.GetProcessById((int)parentId);
                // Keep a handle to this exact process object to prevent PID reuse races.
                parentHandle = parent.Handle;
                Require(SetHandleInformation(parentHandle, 1, 0));
                Require(WaitForSingleObject(parentHandle, 0) == 258);
            }
            job = CreateJobObjectW(IntPtr.Zero, null); Require(job != IntPtr.Zero);
            // NULL security attributes already prohibit inheritance; enforce explicitly too.
            Require(SetHandleInformation(job, 1, 0));
            ExtendedLimit limits = new ExtendedLimit(); limits.basic.flags = 0x2000; // KILL_ON_JOB_CLOSE
            ulong pids = Limit("XFACTOR_LOCAL_JOB_PIDS");
            if (pids > 0) { Require(pids <= UInt32.MaxValue); limits.basic.flags |= 8; limits.basic.activeProcessLimit = (uint)pids; }
            ulong memory = Limit("XFACTOR_LOCAL_JOB_MEMORY_BYTES");
            if (memory > 0) { Require(IntPtr.Size == 8 || memory <= UInt32.MaxValue); limits.basic.flags |= 0x200; limits.jobMemory = new UIntPtr(memory); }
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimit))));
            // Windows 10+ atomically assigns the job during CreateProcess. A separate
            // assignment leaves an orphan suspended child if this host is killed in between.
            UIntPtr attributeBytes = UIntPtr.Zero;
            Require(!InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref attributeBytes) && Marshal.GetLastWin32Error() == 122);
            Require(attributeBytes.ToUInt64() > 0 && attributeBytes.ToUInt64() <= Int32.MaxValue);
            attributes = Marshal.AllocHGlobal((int)attributeBytes.ToUInt64());
            Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref attributeBytes)); attributesInitialized = true;
            jobList = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobList, job);
            Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x0002000D), jobList, new UIntPtr((uint)IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
            StartupInfoEx startup = new StartupInfoEx(); startup.attributeList = attributes;
            startup.startup.cb = (uint)Marshal.SizeOf(typeof(StartupInfoEx)); startup.startup.flags = 0x100;
            startup.startup.stdin = GetStdHandle(-10); startup.startup.stdout = GetStdHandle(-11); startup.startup.stderr = GetStdHandle(-12);
            foreach (IntPtr handle in new IntPtr[] { startup.startup.stdin, startup.startup.stdout, startup.startup.stderr }) {
                Require(handle != IntPtr.Zero && handle != new IntPtr(-1)); Require(SetHandleInformation(handle, 1, 1));
            }
            StringBuilder command = new StringBuilder();
            foreach (string arg in args) { if (command.Length > 0) command.Append(' '); command.Append(Quote(arg)); }
            Require(command.Length < 32767);
            Require(CreateProcessW(args[0], command, IntPtr.Zero, IntPtr.Zero, true, 0x08080004, IntPtr.Zero, null, ref startup, out process));
            if (parentHandle != IntPtr.Zero) Require(WaitForSingleObject(parentHandle, 0) == 258);
            Require(ResumeThread(process.thread) != UInt32.MaxValue);
            while (true) {
                uint status = WaitForSingleObject(process.process, parentHandle == IntPtr.Zero ? UInt32.MaxValue : 250);
                Require(status == 0 || status == 258);
                if (status == 0) break;
                Require(WaitForSingleObject(parentHandle, 0) == 258);
            }
            uint code; Require(GetExitCodeProcess(process.process, out code)); completed = true;
            return unchecked((int)code);
        } catch {
            Console.Error.WriteLine("Windows process containment failed."); return 125;
        } finally {
            if (!completed && process.process != IntPtr.Zero) TerminateProcess(process.process, 125);
            if (process.thread != IntPtr.Zero) CloseHandle(process.thread);
            if (process.process != IntPtr.Zero) CloseHandle(process.process);
            if (job != IntPtr.Zero) CloseHandle(job);
            if (parent != null) parent.Dispose();
            if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (jobList != IntPtr.Zero) Marshal.FreeHGlobal(jobList);
        }
    }
}
