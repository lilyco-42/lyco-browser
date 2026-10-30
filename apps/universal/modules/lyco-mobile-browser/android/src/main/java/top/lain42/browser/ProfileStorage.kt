package top.lain42.browser

import android.content.Context
import android.webkit.WebView
import androidx.webkit.ProcessGlobalConfig
import androidx.webkit.WebViewFeature
import java.io.File
import java.io.IOException
import java.nio.file.FileVisitResult
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.SimpleFileVisitor
import java.nio.file.attribute.BasicFileAttributes
import java.util.UUID

/** Explicit application-owned bases, configured through the public startup API. */
object ProfileStorage {
  private fun owned(context: Context, id: String, cache: Boolean): File {
    val uuid = UUID.fromString(id).toString()
    val parent = (if (cache) context.cacheDir else context.noBackupFilesDir).canonicalFile
    val base = File(parent, if (cache) "lyco-webview-cache-v1" else "lyco-webview-data-v1")
    val root = File(base, uuid)
    check(!Files.isSymbolicLink(base.toPath()) && !Files.isSymbolicLink(root.toPath()) && root.canonicalFile == root.absoluteFile) {
      "环境数据目录无效；条目已保留"
    }
    return root
  }

  // Must run in the isolated browser process before ANY WebView initialization.
  fun configure(context: Context, id: String) {
    check(WebViewFeature.isStartupFeatureSupported(context, WebViewFeature.STARTUP_FEATURE_SET_DIRECTORY_BASE_PATHS)) {
      "请更新系统 WebView，以使用可完整管理数据的独立环境"
    }
    val data = owned(context, id, false)
    val cache = owned(context, id, true)
    for (root in listOf(data, cache)) check((root.isDirectory || root.mkdirs()) && root.canRead() && root.canWrite()) {
      "无法创建环境专用数据目录"
    }
    ProcessGlobalConfig.apply(ProcessGlobalConfig().setDirectoryBasePaths(context, data, cache))
    WebView.setDataDirectorySuffix("lyco_${UUID.fromString(id)}")
  }

  // Caller first closes and verifies the browser process. Delete only the
  // exact bases given to WebView, with no guessed provider-internal paths.
  fun clear(context: Context, id: String) {
    for (root in listOf(owned(context, id, false), owned(context, id, true))) {
      if (!Files.exists(root.toPath(), LinkOption.NOFOLLOW_LINKS)) continue
      Files.walkFileTree(root.toPath(), object : SimpleFileVisitor<Path>() {
        override fun visitFile(file: Path, attributes: BasicFileAttributes): FileVisitResult {
          Files.delete(file) // No FOLLOW_LINKS: remove a link, never its target.
          return FileVisitResult.CONTINUE
        }
        override fun postVisitDirectory(directory: Path, error: IOException?): FileVisitResult {
          if (error != null) throw error
          Files.delete(directory)
          return FileVisitResult.CONTINUE
        }
      })
      check(!Files.exists(root.toPath(), LinkOption.NOFOLLOW_LINKS)) { "环境网站数据尚未清除，请重试" }
    }
  }
}
