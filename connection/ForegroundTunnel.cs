using System;

using System.Diagnostics;

using System.IO;

using System.Runtime.InteropServices;

using System.Security;



internal static class ForegroundTunnel {

  static Process active;

  static bool cancelled;

  static readonly string Root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));

  static readonly string Profile = Path.Combine(Root, "connection", "profiles", "google-tasks.yaml");

  static string Quote(string value) { return "\"" + value + "\""; }

  static int Child(string executable, string arguments, string key) {

    var start = new ProcessStartInfo(executable, arguments) { UseShellExecute = false, WorkingDirectory = Root };

    start.EnvironmentVariables.Remove("OPENAI_API_KEY");

    start.EnvironmentVariables.Remove("OPENAI_ADMIN_KEY");

    start.EnvironmentVariables["CONTROL_PLANE_API_KEY"] = key;

    start.EnvironmentVariables["LOG_HTTP_RAW_UNSAFE"] = "false";

    start.EnvironmentVariables["LOG_FILE"] = "stdout";

    try {

      using (var child = Process.Start(start)) {

        active = child;

        start.EnvironmentVariables.Remove("CONTROL_PLANE_API_KEY");

        child.WaitForExit();

        active = null;

        return child.ExitCode;

      }

    } finally { start.EnvironmentVariables.Remove("CONTROL_PLANE_API_KEY"); }

  }

  static int Main(string[] args) {

    if (args.Length == 1 && args[0] == "--self-test-child") {

      return Environment.GetEnvironmentVariable("CONTROL_PLANE_API_KEY") == "NONSECRET_OFFLINE_DUMMY" && Environment.GetEnvironmentVariable("OPENAI_API_KEY") == null && Environment.GetEnvironmentVariable("OPENAI_ADMIN_KEY") == null ? 0 : 1;

    }

    if (args.Length == 1 && args[0] == "--self-test") {

      int code = Child(Process.GetCurrentProcess().MainModule.FileName, "--self-test-child", "NONSECRET_OFFLINE_DUMMY");

      Console.WriteLine(code == 0 ? "OFFLINE_MASKED_LAUNCHER_CHILD_ENV_PASS_NO_NETWORK" : "OFFLINE_LAUNCHER_FAILED");

      return code;

    }

    if (args.Length != 0) { Console.Error.WriteLine("LAUNCHER_ARGUMENTS_REJECTED"); return 1; }

    Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e) {

      e.Cancel = true; cancelled = true;

      try { if (active != null && !active.HasExited) active.Kill(); } catch { }

    };

    IntPtr bstr = IntPtr.Zero;

    string key = null;

    using (var secure = new SecureString()) {

      try {

        if (!File.Exists(Profile)) throw new Exception();

        Console.WriteLine("Google Tasks foreground tunnel. No key is saved. Ctrl+C stops it.");

        Console.Write("Paste the PERSONAL Restricted runtime key here (input hidden), then press Enter: ");

        while (!cancelled) {

          var input = Console.ReadKey(true);

          if (input.Key == ConsoleKey.Enter) break;

          if (input.Key == ConsoleKey.Backspace) { if (secure.Length > 0) secure.RemoveAt(secure.Length - 1); continue; }

          if (!Char.IsControl(input.KeyChar) && secure.Length < 4096) secure.AppendChar(input.KeyChar);

        }

        Console.WriteLine();

        if (cancelled || secure.Length == 0) return 1;

        bstr = Marshal.SecureStringToBSTR(secure);

        key = Marshal.PtrToStringBSTR(bstr);

        string executable = Path.Combine(Root, "tools", "tunnel-client-v0.0.15", "tunnel-client.exe");

        string common = " --profile-file " + Quote(Profile) + " --log.level error --log.http-raw-unsafe=false --admin-ui.log-buffer-events 1";

        Console.WriteLine("Checking tunnel configuration and runtime access...");

        if (Child(executable, "doctor" + common + " --explain", key) != 0 || cancelled) {

          Console.Error.WriteLine("TUNNEL_DOCTOR_FAILED_NO_DAEMON_STARTED"); return 1;

        }

        Console.WriteLine("Starting foreground tunnel. Keep this window open during cloud discovery.");

        string metadata = " --health.url-file " + Quote(Path.Combine(Root,"connection","health.url")) + " --pid.file " + Quote(Path.Combine(Root,"connection","foreground.pid"));

        return Child(executable, "run" + common + metadata, key);

      } catch { Console.Error.WriteLine("FOREGROUND_HANDOFF_FAILED_NO_KEY_LOGGED"); return 1; }

      finally {

        if (bstr != IntPtr.Zero) Marshal.ZeroFreeBSTR(bstr);

        key = null;

        secure.Clear();

      }

    }

  }

}

