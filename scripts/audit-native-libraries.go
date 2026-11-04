// Read original APK ELF metadata on Actions without loading or executing its libraries.
package main

import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"debug/buildinfo"
	"debug/elf"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

func must(err error) {
	if err != nil { panic(err) }
}

func require(ok bool, message string) {
	if !ok { panic(message) }
}

func digest(data []byte) string {
	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

func main() {
	require(os.Getenv("GITHUB_ACTIONS") == "true", "Actions only")
	require(runtime.Version() == "go1.25.5", "Pinned metadata reader required")
	root := os.Getenv("LYCO_NATIVE_JS_AUDIT")
	require(root != "", "Evidence directory required")
	catalogBytes, err := os.ReadFile("apps/universal/src/go-notices.json"); must(err)
	var catalog struct {
		Generated bool `json:"generated"`
		GoVersion string `json:"goVersion"`
		Packages []struct { Name string `json:"name"`; Version string `json:"version"`; Sum string `json:"sum"` } `json:"packages"`
	}
	must(json.Unmarshal(catalogBytes, &catalog))
	require(catalog.Generated && catalog.GoVersion == "go1.25.5" && len(catalog.Packages) > 0, "Verified offline Go catalog required")
	expectedModules := map[string]bool{}
	for _, module := range catalog.Packages { expectedModules[module.Name+"\x00"+module.Version+"\x00"+module.Sum] = true }
	require(len(expectedModules) == len(catalog.Packages), "Duplicate catalog modules")
	bindingBytes, err := os.ReadFile(filepath.Join(root, "verified-artifacts.json")); must(err)
	var binding map[string]any
	must(json.Unmarshal(bindingBytes, &binding))
	require(binding["originalSizeShaCrcVerified"] == true, "Original archive verification required")
	apkPath := filepath.Join(root, "candidate/files/LYCO-Browser-Android-preview.apk")
	apkBytes, err := os.ReadFile(apkPath); must(err)
	require(digest(apkBytes) == binding["apkSha256"], "Actual APK binding mismatch")
	zipped, err := zip.NewReader(bytes.NewReader(apkBytes), int64(len(apkBytes))); must(err)
	output := filepath.Join(root, "native-libraries")
	must(os.MkdirAll(output, 0700))
	libraries := []map[string]any{}
	seen := map[string]bool{}
	goInfoCount := 0
	var expanded uint64
	for _, file := range zipped.File {
		if !strings.HasPrefix(file.Name, "lib/") || !strings.HasSuffix(file.Name, ".so") { continue }
		parts := strings.Split(file.Name, "/")
		require(len(parts) == 3 && (parts[1] == "arm64-v8a" || parts[1] == "x86_64"), "Unexpected native path")
		require(!seen[file.Name] && file.UncompressedSize64 <= 128*1024*1024, "Duplicate or oversized native file")
		seen[file.Name] = true
		expanded += file.UncompressedSize64
		require(expanded <= 512*1024*1024 && len(seen) <= 128, "Native inventory exceeds bounds")
		stream, err := file.Open(); must(err)
		data, err := io.ReadAll(io.LimitReader(stream, 128*1024*1024+1)); must(err)
		must(stream.Close())
		require(uint64(len(data)) == file.UncompressedSize64, "Native file size mismatch")
		binary, err := elf.NewFile(bytes.NewReader(data)); must(err)
		require(binary.Class == elf.ELFCLASS64 && binary.Type == elf.ET_DYN, "Expected 64-bit shared library")
		expected := elf.EM_AARCH64
		if parts[1] == "x86_64" { expected = elf.EM_X86_64 }
		require(binary.Machine == expected, "Native ABI mismatch")
		needed, err := binary.ImportedLibraries(); must(err)
		row := map[string]any{"path": file.Name, "bytes": len(data), "sha256": digest(data),
			"abi": parts[1], "elfClass": binary.Class.String(), "elfMachine": binary.Machine.String(),
			"neededLibraries": needed, "licenseAndSourceMappingProven": false}
		if section := binary.Section(".comment"); section != nil {
			require(section.Size <= 65536, "Compiler metadata exceeds bounds")
			comment, err := section.Data(); must(err)
			row["compilerComments"] = strings.Split(strings.TrimRight(string(comment), "\x00"), "\x00")
		}
		info, infoErr := buildinfo.Read(bytes.NewReader(data))
		if infoErr == nil {
			require(info.GoVersion == catalog.GoVersion && len(info.Deps) == len(expectedModules), "Actual APK Go dependencies differ from offline declarations")
			for _, module := range info.Deps {
				require(module.Replace == nil && expectedModules[module.Path+"\x00"+module.Version+"\x00"+module.Sum], "Actual APK module not covered by original offline catalog")
			}
			row["embeddedGoBuildInfo"] = info
			row["offlineGoModuleGraphMatches"] = true
			goInfoCount++
			must(os.WriteFile(filepath.Join(output, parts[1]+"-"+parts[2]+".buildinfo.txt"), []byte(info.String()), 0600))
		} else {
			row["goBuildInfoUnavailable"] = infoErr.Error()
		}
		libraries = append(libraries, row)
		must(binary.Close())
	}
	require(seen["lib/arm64-v8a/libgojni.so"] && seen["lib/x86_64/libgojni.so"], "Both original Go JNI libraries required")
	require(goInfoCount == 2, "Both actual Go JNI dependency graphs must be readable and covered")
	sort.Slice(libraries, func(i, j int) bool { return libraries[i]["path"].(string) < libraries[j]["path"].(string) })
	report := map[string]any{"schemaVersion": 1, "sourceBinding": binding, "readerGoVersion": runtime.Version(),
		"analyzerCommit": os.Getenv("GITHUB_SHA"), "analyzerRun": os.Getenv("GITHUB_RUN_ID"),
		"scope": "Original APK ELF headers, DT_NEEDED, compiler comments and embedded Go build information; target libraries never executed",
		"nativeLibraries": libraries, "nativeLibraryCount": len(libraries), "embeddedGoBuildInfoCount": goInfoCount,
		"offlineGoCatalogSha256": digest(catalogBytes),
		"completeLicenseMappingProven": false, "completeCorrespondingSourceProven": false,
		"limits": []string{"Embedded metadata describes the binary; it does not prove a reproducible source-to-binary match", "DT_NEEDED omits statically linked components", "Compiler comments do not establish the complete NDK version", "Missing Go build metadata remains unknown; it does not mean no Go code is present"}}
	encoded, err := json.MarshalIndent(report, "", "  "); must(err)
	must(os.WriteFile(filepath.Join(output, "NATIVE-LIBRARY-INVENTORY.json"), append(encoded, '\n'), 0600))
	fmt.Printf("Native ELF libraries: %d; embedded Go build records: %d; license/source clearance remains unproven\n", len(libraries), goInfoCount)
}
