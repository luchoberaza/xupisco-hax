using System;
using System.Diagnostics;
using System.IO;

class Launcher {
    static void Main() {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string electron = Path.Combine(baseDir, "node_modules", "electron", "dist", "electron.exe");

        if (!File.Exists(electron)) {
            return;
        }

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = electron;
        psi.Arguments = "\"" + baseDir.TrimEnd('\\') + "\"";
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        Process.Start(psi);
    }
}
