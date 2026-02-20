import QrScanner from "@/components/QrScanner";

export const metadata = {
  title: "Scan QR Code — MakerLab Tools",
};

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">Scan QR Code</h1>
      <p className="mb-6 text-sm text-muted">
        Point your camera at the QR code on any machine to view its details,
        status, and report issues.
      </p>
      <QrScanner />
    </div>
  );
}
