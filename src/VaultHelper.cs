using System;
using System.IO;
using System.Text;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;

// Native Windows helper: avoids invoking a .ps1 file; never changes execution policy.
internal static class VaultHelper {
  private static int Main(string[] args) {
    byte[] plain = null;
    try {
      if (args.Length != 2 || (args[0] != "load" && args[0] != "save")) throw new Exception();
      string target = Path.GetFullPath(args[1]);
      if (args[0] == "load") {
        plain = ProtectedData.Unprotect(File.ReadAllBytes(target), null, DataProtectionScope.CurrentUser);
        Console.Out.Write(Encoding.UTF8.GetString(plain));
      } else {
        string input = Console.In.ReadToEnd();
        if (input.Length > 65536) throw new Exception();
        plain = Encoding.UTF8.GetBytes(input);
        byte[] cipher = ProtectedData.Protect(plain, null, DataProtectionScope.CurrentUser);
        string directory = Path.GetDirectoryName(target);
        Directory.CreateDirectory(directory);
        SecurityIdentifier identity = WindowsIdentity.GetCurrent().User;
        DirectorySecurity acl = new DirectorySecurity();
        acl.SetAccessRuleProtection(true, false);
        acl.SetOwner(identity);
        acl.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl,
          InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        Directory.SetAccessControl(directory, acl);
        string temporary = Path.Combine(directory, Guid.NewGuid().ToString() + ".tmp");
        try {
          File.WriteAllBytes(temporary, cipher);
          if (File.Exists(target)) File.Replace(temporary, target, null); else File.Move(temporary, target);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
      }
      return 0;
    } catch { Console.Error.Write("VAULT_OPERATION_FAILED"); return 1; }
    finally { if (plain != null) Array.Clear(plain, 0, plain.Length); }
  }
}
