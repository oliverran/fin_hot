// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "FinHOTCore",
    platforms: [.macOS(.v13), .iOS(.v17)],
    products: [.library(name: "FinHOTCore", targets: ["FinHOTCore"])],
    targets: [
        .target(name: "FinHOTCore", path: "Core"),
        .executableTarget(name: "FinHOTCoreChecks", dependencies: ["FinHOTCore"], path: "Tests")
    ]
)
