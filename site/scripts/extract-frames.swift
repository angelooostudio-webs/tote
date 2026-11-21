// Extracts every frame of a video to PNG using macOS AVFoundation (no ffmpeg needed).
//   swift scripts/extract-frames.swift <video.mp4> <outDir>
import AVFoundation
import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let out = CommandLine.arguments[2]
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)
let asset = AVURLAsset(url: url)
guard let track = asset.tracks(withMediaType: .video).first else { fatalError("no video track") }
let fps = Double(track.nominalFrameRate)
let count = Int((CMTimeGetSeconds(asset.duration) * fps).rounded(.down))
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero
for i in 0..<count {
  let t = CMTime(value: CMTimeValue(i * 1000), timescale: CMTimeScale(fps * 1000))
  let t2 = CMTimeAdd(t, CMTime(value: 1, timescale: CMTimeScale(fps * 2)))
  guard let cg = try? gen.copyCGImage(at: t2, actualTime: nil) else { continue }
  let rep = NSBitmapImageRep(cgImage: cg)
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: String(format: "%@/%04d.png", out, i)))
}
print("frames:", count, "fps:", fps)
