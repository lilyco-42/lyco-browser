//go:build tools

package lycotunnel

// Keep the native binder's runtime packages in this module's verified graph.
// The binding generators load these packages from the target module, even when
// their command binaries were installed separately with go install.
import _ "github.com/sagernet/gomobile"
