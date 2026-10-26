package top.lain42.browser

import android.content.Intent
import android.content.Context
import android.app.ActivityManager
import android.os.Process
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Queues

class LycoMobileBrowserModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LycoMobileBrowser")
    AsyncFunction("open") { options: Map<String, String> ->
      check(Build.VERSION.SDK_INT >= 28) { "独立环境需要 Android 9 或更新版本" }
      val context = appContext.reactContext ?: error("应用尚未就绪")
      val intent = Intent(context, ProfileBrowserActivity::class.java)
      for ((key, value) in options) intent.putExtra(key, value)
      val preferences = context.getSharedPreferences(ProfileControl.PREFERENCES, Context.MODE_PRIVATE)
      intent.putExtra(ProfileControl.EPOCH, preferences.getLong(ProfileControl.EPOCH, 0))
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("closeAll") {
      val context = appContext.reactContext ?: return@AsyncFunction
      val preferences = context.getSharedPreferences(ProfileControl.PREFERENCES, Context.MODE_PRIVATE)
      synchronized(ProfileControl) {
        check(preferences.edit().putLong(ProfileControl.EPOCH, preferences.getLong(ProfileControl.EPOCH, 0) + 1).commit()) { "无法停止待启动环境" }
      }
      context.sendBroadcast(Intent(ProfileControl.ACTION_CLOSE).setPackage(context.packageName), ProfileControl.PERMISSION)
      val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val name = context.packageName + ":lyco_browser"
      val original = manager.runningAppProcesses.orEmpty().filter { it.processName == name }.map { it.pid }.toSet()
      // Allow cookie/database flush and ordinary native destruction first. Only
      // a still-running original process is terminated after this bounded wait.
      val deadline = android.os.SystemClock.elapsedRealtime() + 1500
      while (android.os.SystemClock.elapsedRealtime() < deadline && manager.runningAppProcesses.orEmpty().any { it.pid in original }) Thread.sleep(30)
      for (process in manager.runningAppProcesses.orEmpty()) if (process.processName == name && process.pid in original) Process.killProcess(process.pid)
    }
  }
}
