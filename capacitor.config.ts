import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor configuration for wrapping this web app into the Android APK
// (the user builds it from GitHub — see ANDROID-BUILD.md for the steps).
//
// webDir points at the built web bundle. `bun run build:client` writes it
// to client/dist-cvm in this workspace; a plain checkout builds it to
// client/dist. The GitHub Actions workflow (.github/workflows/android.yml)
// copies the built bundle into android/app/src/main/assets/public via
// `cap sync`, so this value only matters for local `cap` commands — if a
// local sync cannot find the folder, build the client first and point
// webDir at the folder the build produced.
const config: CapacitorConfig = {
  appId: "com.tuhin.ramadanapp",
  appName: "আমলখাতা",
  webDir: "client/dist",
  plugins: {
    LocalNotifications: {
      // Icon/colour used by the OS-level notifications (hadith reminders
      // and the Sehri alarm) that Android delivers even while the app is
      // fully closed. The icon file itself is added by the Android build
      // (see ANDROID-BUILD.md, step on notification icon).
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#0B3D2E",
    },
  },
};

export default config;
