package top.lain42.browser

import android.content.Intent
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
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }.runOnQueue(Queues.MAIN)
  }
}
