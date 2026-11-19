$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
Set-Location $PSScriptRoot
$sdk = $env:ANDROID_HOME
if (!$sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if ($sdk) {
    $jdk = $env:JAVA_HOME
    $bt = Join-Path $sdk 'build-tools/35.0.0'
    $platform = Join-Path $sdk 'platforms/android-35/android.jar'
    if (!$jdk -or !(Test-Path "$jdk/bin/javac.exe") -or !(Test-Path "$bt/aapt2.exe") -or !(Test-Path $platform)) {
        throw 'Set JAVA_HOME to a JDK and install Android SDK Platform 35 and Build Tools 35.0.0.'
    }
} else {
    $tc="../Agent-Looper-next/android/.toolchain"
    $jdk=(ls "$tc/jdk" -Directory | select -First 1).FullName
    $bt=(ls "$tc/build-tools*/*/aapt2.exe" | select -First 1).DirectoryName
    $platform=(ls "$tc/platform-35*/*/android.jar" | select -First 1).FullName
}
$env:JAVA_HOME=$jdk
$env:PATH="$jdk/bin;$env:PATH"
mkdir -Force build/classes,build/dex | out-null
& "$bt/aapt2.exe" compile --dir res -o build/res.zip
& "$bt/aapt2.exe" link -o build/base.apk -I $platform --manifest AndroidManifest.xml build/res.zip
& "$jdk/bin/javac" -source 8 -target 8 -classpath "$platform;vendor/jsoup.jar" -d build/classes Loom.java ArchiveClient.java Controller.java ImageSources.java FolderMedia.java RemoteVideo.java GoogleImages.java ClipStore.java Mp4Export.java
& "$jdk/bin/jar" cf build/app.jar -C build/classes .
& "$bt/d8.bat" --lib $platform --min-api 26 --output build/dex build/app.jar vendor/jsoup.jar
# Windows AAPT2 uses backslashes in nested asset names. JAR writes APK assets with forward slashes.
& "$jdk/bin/jar" uf build/base.apk -C build/dex classes.dex assets
& "$bt/zipalign.exe" -f 4 build/base.apk build/aligned.apk
$key="$env:USERPROFILE/.android/temporal-loom.p12"
if(!(Test-Path $key)){
mkdir -Force "$env:USERPROFILE/.android" | out-null
& "$jdk/bin/keytool" -genkeypair -keystore $key -storepass android -alias loom -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Temporal Loom Local'
}
& "$bt/apksigner.bat" sign --ks $key --ks-pass pass:android --out Temporal-Loom.apk build/aligned.apk
& "$bt/apksigner.bat" verify --verbose Temporal-Loom.apk

