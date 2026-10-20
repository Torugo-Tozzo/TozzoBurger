# No app-specific rules: the release build (R8, minify + shrink resources) needs none.
# Verified on 2026-10-20 (task 4): R8 prints no warnings, and its configuration.txt already holds the
# consumer rules each library ships for what the app uses:
#   - Hilt/Dagger (entry points), kotlinx.serialization (@Serializable models: serializer() and Companion),
#   - Tink (shaded protobuf GeneratedMessageLite fields), PowerSync (the bundled SQLite driver's native methods),
#   - Retrofit/OkHttp, DataStore protobuf.
# Add a rule here only for a crash or an R8 "missing class" that a release run shows, with the reason.
