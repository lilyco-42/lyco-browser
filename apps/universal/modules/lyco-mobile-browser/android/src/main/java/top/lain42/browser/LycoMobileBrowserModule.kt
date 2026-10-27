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
      synchronized(ProfileControl) {
        val preferences = context.getSharedPreferences(ProfileControl.PREFERENCES, Context.MODE_PRIVATE)
        intent.putExtra(ProfileControl.EPOCH, preferences.getLong(ProfileControl.EPOCH, 0))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }.runOnQueue(Queues.MAIN)
    AsyncFunction("closeAll") {
      val context = appContext.reactContext ?: error("应用尚未就绪")
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
      val stoppedDeadline = android.os.SystemClock.elapsedRealtime() + 1500
      while (android.os.SystemClock.elapsedRealtime() < stoppedDeadline && manager.runningAppProcesses.orEmpty().any { it.processName == name }) Thread.sleep(30)
      check(manager.runningAppProcesses.orEmpty().none { it.processName == name }) { "浏览环境尚未停止，请重试" }
    }
    AsyncFunction("clearProfile") { id: String ->
      val context = appContext.reactContext ?: error("应用尚未就绪")
      synchronized(ProfileControl) {
        val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        check(manager.runningAppProcesses.orEmpty().none { it.processName == context.packageName + ":lyco_browser" }) {
          "请先关闭浏览环境，再清除网站数据"
        }
        // Invalidate an already-queued Activity launch before deleting its
        // storage. A new open waits on this same lock until deletion completes.
        val preferences = context.getSharedPreferences(ProfileControl.PREFERENCES, Context.MODE_PRIVATE)
        check(preferences.edit().putLong(ProfileControl.EPOCH, preferences.getLong(ProfileControl.EPOCH, 0) + 1).commit()) {
          "无法停止待启动环境，数据条目已保留"
        }
        ProfileStorage.clear(context, id)
      }
    }
  }
}
