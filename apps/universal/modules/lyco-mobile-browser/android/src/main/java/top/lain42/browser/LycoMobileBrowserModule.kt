package top.lain42.browser

import android.content.Intent
import android.content.Context
import android.app.ActivityManager
import android.os.Process
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.ResultReceiver
import android.app.Activity
import java.util.UUID
import expo.modules.kotlin.Promise
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
    AsyncFunction("clearProfile") { id: String, promise: Promise ->
      val context = appContext.reactContext ?: error("应用尚未就绪")
      val normalized = UUID.fromString(id).toString()
      val handler = Handler(Looper.getMainLooper())
      var settled = false
      fun settle(success: Boolean, message: String?) {
        if (settled) return
        settled = true
        handler.removeCallbacksAndMessages(null)
        if (success) promise.resolve() else promise.reject("ERR_PROFILE_DATA", message ?: "无法清除网站数据，环境条目已保留", null)
      }
      val receiver = object : ResultReceiver(handler) {
        override fun onReceiveResult(code: Int, data: Bundle?) { settle(code == Activity.RESULT_OK, data?.getString("message")) }
      }
      handler.postDelayed({ settle(false, "清除超时，环境条目已保留") }, 25000)
      try {
        context.startActivity(Intent(context, ProfileDataActivity::class.java).putExtra("id", normalized).putExtra("result", receiver).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      } catch (_: Exception) { settle(false, "无法打开网站数据清除功能，环境条目已保留") }
    }.runOnQueue(Queues.MAIN)
  }
}
