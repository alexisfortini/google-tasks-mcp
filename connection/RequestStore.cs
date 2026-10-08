using System;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Reflection;
internal static class RequestStore {
  private static void RestrictNew(string target) {
    if (Directory.Exists(target) || File.Exists(target)) throw new Exception();
    Directory.CreateDirectory(target);
    SecurityIdentifier identity = WindowsIdentity.GetCurrent().User;
    DirectorySecurity acl = new DirectorySecurity();
    acl.SetAccessRuleProtection(true, false);
    acl.SetOwner(identity);
    acl.AddAccessRule(new FileSystemAccessRule(identity, FileSystemRights.FullControl,
      InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
    Directory.SetAccessControl(target, acl);
  }
  private static void Check(string target) {
    if (!Directory.Exists(target) || (File.GetAttributes(target) & FileAttributes.ReparsePoint) != 0) throw new Exception();
    SecurityIdentifier identity = WindowsIdentity.GetCurrent().User;
    DirectorySecurity acl = Directory.GetAccessControl(target);
    AuthorizationRuleCollection rules = acl.GetAccessRules(true, true, typeof(SecurityIdentifier));
    if (!acl.AreAccessRulesProtected || !acl.GetOwner(typeof(SecurityIdentifier)).Equals(identity) || rules.Count != 1) throw new Exception();
    FileSystemAccessRule rule = (FileSystemAccessRule)rules[0];
    if (!rule.IdentityReference.Equals(identity) || rule.AccessControlType != AccessControlType.Allow || rule.FileSystemRights != FileSystemRights.FullControl || rule.IsInherited || rule.InheritanceFlags != (InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit)) throw new Exception();
  }
  private static int Main(string[] args) {
    try {
      if (args.Length != 1) throw new Exception();
      string root = Path.GetFullPath(Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location), ".."));
      string target = Path.Combine(root, ".private", "action-control");
      if (args[0] == "--check") Check(target);
      else if (args[0] == "--initialize-approved-capability-store") { RestrictNew(target); Check(target); }
      else if (args[0] == "--self-test") {
        string tempRoot = Path.GetFullPath(Path.GetTempPath());
        string test = Path.GetFullPath(Path.Combine(tempRoot, "axs-request-store-test-" + Guid.NewGuid().ToString()));
        if (!test.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase)) throw new Exception();
        try { RestrictNew(test); Check(test); File.WriteAllText(Path.Combine(test, "synthetic.txt"), "NONSECRET_SYNTHETIC"); }
        finally { if (Directory.Exists(test)) Directory.Delete(test, true); }
      } else throw new Exception();
      Console.WriteLine("REQUEST_STORE_CHECK_PASS"); return 0;
    } catch { Console.Error.WriteLine("REQUEST_STORE_REQUIRED"); return 1; }
  }
}
