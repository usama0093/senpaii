// Centered "Senpaii" brand mark shown at the top of full-screen host/student session
// screens (Game PIN, Live/Regular QOD, Live Feedback) — these screens have no
// PublicLayout header, so without this the name disappears once a session starts.
// Not a link: navigating away mid-session would drop the student's/host's socket
// connection, so this is a static mark rather than clickable like the main header.
export default function SessionBrand() {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-4 md:pt-5 pointer-events-none">
      <span className="text-2xl md:text-4xl font-extrabold text-brand-accent">Senpaii</span>
    </div>
  );
}