import Foundation
import Vision
import ImageIO
struct Line: Codable { let text: String; let confidence: Float; let x: Double; let y: Double; let width: Double; let height: Double }
do {
 guard CommandLine.arguments.count == 2 else { throw NSError(domain:"OCR",code:1) }
 let url = URL(fileURLWithPath:CommandLine.arguments[1])
 guard let source = CGImageSourceCreateWithURL(url as CFURL,nil), CGImageSourceGetCount(source)==1,
       let props = CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],
       let width = props[kCGImagePropertyPixelWidth] as? Int, let height = props[kCGImagePropertyPixelHeight] as? Int,
       width > 0, height > 0, width <= 24000000 / height,
       let image = CGImageSourceCreateImageAtIndex(source,0,nil) else { throw NSError(domain:"OCR_INVALID_IMAGE",code:2) }
 let request = VNRecognizeTextRequest()
 request.recognitionLevel = .accurate
 request.recognitionLanguages = ["zh-Hans","en-US"]
 request.usesLanguageCorrection = false
 try VNImageRequestHandler(cgImage:image,options:[:]).perform([request])
 let lines = (request.results ?? []).prefix(500).compactMap { item -> Line? in
   guard let candidate = item.topCandidates(1).first else { return nil }
   let b = item.boundingBox
   return Line(text:candidate.string,confidence:candidate.confidence,x:b.origin.x,y:1-b.origin.y-b.height,width:b.width,height:b.height)
 }.sorted { $0.y == $1.y ? $0.x < $1.x : $0.y < $1.y }
 FileHandle.standardOutput.write(try JSONEncoder().encode(lines))
} catch { FileHandle.standardError.write(Data("OCR failed: \(error)".utf8)); exit(1) }
