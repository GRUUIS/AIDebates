import DebateRoomPage from "@/components/debate-room-page";

export default async function DebateSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return <DebateRoomPage sessionId={sessionId} />;
}
