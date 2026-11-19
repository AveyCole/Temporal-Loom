param([switch]$Verify)
$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
Set-Location $PSScriptRoot
$refs='C:/Program Files (x86)/Reference Assemblies/Microsoft/Framework/.NETFramework/v4.7.2'
$csc="$env:WINDIR/Microsoft.NET/Framework64/v4.0.30319/csc.exe"
function Package([string]$id,[string]$version,[string]$folder){
    if(Test-Path -LiteralPath "$folder/package/[Content_Types].xml"){return}
    New-Item -ItemType Directory -Force $folder | Out-Null
    curl.exe --noproxy '*' -fLsS --max-time 90 "https://api.nuget.org/v3-flatcontainer/$id/$version/$id.$version.nupkg" -o "$folder/nuget.zip"
    Expand-Archive -Force "$folder/nuget.zip" "$folder/package"
}
Package microsoft.web.webview2 1.0.3595.46 vendor/webview2
Package htmlagilitypack 1.11.72 vendor/html
if(!(Test-Path 'vendor/html/LICENSE')){
    curl.exe -fLsS --max-time 30 https://raw.githubusercontent.com/zzzprojects/html-agility-pack/v1.11.72/LICENSE -o vendor/html/LICENSE
}
$wv='vendor/webview2/package/lib/net462'
$html='vendor/html/package/lib/Net45/HtmlAgilityPack.dll'
$ffmpeg=Get-ChildItem vendor/ffmpeg/package -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
if(!$ffmpeg){
    New-Item -ItemType Directory -Force vendor/ffmpeg | Out-Null
    curl.exe -fLsS --max-time 120 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -o vendor/ffmpeg/build.zip
    Expand-Archive -Force vendor/ffmpeg/build.zip vendor/ffmpeg/package
    $ffmpeg=Get-ChildItem vendor/ffmpeg/package -Directory | Select-Object -First 1
}
node desktop.mjs
if($Verify){$out='obj/verify'}else{$out='dist/Temporal Loom'}
New-Item -ItemType Directory -Force "$out/Legal" | Out-Null
$naudio='vendor/audio'
if (!(Test-Path "$naudio/NAudio.Core.dll")) { $naudio='../../Agent-Looper-next/windows' }
$libraries=@("$wv/Microsoft.Web.WebView2.Core.dll","$wv/Microsoft.Web.WebView2.WinForms.dll",$html,"$naudio/NAudio.Core.dll","$naudio/NAudio.Asio.dll")
$files=@('LoomWindow.cs','DisplayWindow.cs','Sources.cs','GoogleBrowser.cs','ClipRecorder.cs','MidiInput.cs','AsioInput.cs')
$flags=@()
if($Verify){$flags+= '/define:VERIFY';$files+='Verification.cs'}
$framework=@('mscorlib','System','System.Core','System.Drawing','System.Windows.Forms','System.Net.Http','System.Web','System.Web.Extensions','System.Xml')
& $csc /nologo /noconfig /nostdlib /langversion:5 /platform:x64 /target:winexe /optimize /unsafe "/out:$out/Temporal Loom.exe" /win32manifest:app.manifest /win32icon:obj/loom.ico /resource:obj/index.html,index.html /resource:obj/archive.js,archive.js /resource:display.html,display.html /resource:../assets/thesaurus.json,thesaurus.json "/reference:$refs/Facades/netstandard.dll" ($framework | ForEach-Object { "/reference:$refs/$_.dll" }) ($libraries | ForEach-Object { "/reference:$_" }) $flags $files
Copy-Item -LiteralPath $libraries -Destination $out -Force
Copy-Item -LiteralPath "$naudio/Microsoft.Win32.Registry.dll" -Destination $out -Force
Copy-Item -LiteralPath 'vendor/webview2/package/runtimes/win-x64/native/WebView2Loader.dll' -Destination $out -Force
Copy-Item -LiteralPath "$($ffmpeg.FullName)/bin/ffmpeg.exe" -Destination $out -Force
Copy-Item -LiteralPath "$($ffmpeg.FullName)/LICENSE" -Destination "$out/Legal/FFmpeg LICENSE.txt" -Force
Copy-Item -LiteralPath "$($ffmpeg.FullName)/README.txt" -Destination "$out/Legal/FFmpeg build and source.txt" -Force
Copy-Item -LiteralPath 'vendor/webview2/package/LICENSE.txt' -Destination "$out/Legal/WebView2 LICENSE.txt" -Force
Copy-Item -LiteralPath 'vendor/webview2/package/NOTICE.txt' -Destination "$out/Legal/WebView2 NOTICE.txt" -Force
Copy-Item -LiteralPath 'vendor/html/LICENSE' -Destination "$out/Legal/HtmlAgilityPack LICENSE.txt" -Force
Copy-Item -LiteralPath "$naudio/NAudio.LICENSE.txt" -Destination "$out/Legal/NAudio LICENSE.txt" -Force
if (Test-Path "$naudio/Registry.LICENSE.txt") {
    Copy-Item -LiteralPath "$naudio/Registry.LICENSE.txt" -Destination "$out/Legal/Microsoft.Win32.Registry LICENSE.txt" -Force
}
Copy-Item -Path '../assets/type-licenses/*' -Destination "$out/Legal" -Force
Copy-Item -LiteralPath '../assets/legal/WordNet-LICENSE.txt' -Destination "$out/Legal" -Force
Copy-Item -LiteralPath '../assets/type-fonts' -Destination $out -Recurse -Force
Copy-Item -LiteralPath 'START HERE.txt' -Destination $out -Force
if(!$Verify){Compress-Archive -Path $out -DestinationPath 'dist/Temporal-Loom-1.21-Windows-x64.zip' -Force}
