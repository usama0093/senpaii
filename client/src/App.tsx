// import { BrowserRouter, Routes, Route } from "react-router-dom";
// import { AuthProvider } from "./context/AuthContext";
// import ProtectedRoute from "./components/ProtectedRoute";
// import AppLayout from "./components/AppLayout";
// import PublicLayout from "./components/PublicLayout";
// import Login from "./pages/Login";
// import Register from "./pages/Register";
// import Dashboard from "./pages/Dashboard";
// import QuizOfTheDay from "./pages/QuizOfTheDay";
// import QuizSessions from "./pages/QuizSessions";
// import Feedback from "./pages/Feedback";
// import LiveFeedbackHome from "./pages/LiveFeedbackHome";
// import LiveFeedbackHost from "./pages/LiveFeedbackHost";
// import JoinFeedback from "./pages/JoinFeedback";
// import FeedbackRoom from "./pages/FeedbackRoom";
// import Reports from "./pages/Reports";
// import ReportDetail from "./pages/ReportDetail";
// import GameFinished from "./pages/GameFinished";
// import Settings from "./pages/Settings";
// import Trash from "./pages/Trash";
// import QuizEditor from "./pages/QuizEditor";
// import QodQuizEditor from "./pages/QodQuizEditor";
// import QodReportDetail from "./pages/QodReportDetail";
// import JoinGame from "./pages/JoinGame";
// import HostLobby from "./pages/HostLobby";
// import PlayGame from "./pages/PlayGame";
// // import QODRegular from "./pages/QODRegular";
// import QODLive from "./pages/QODLive";
// import QodSessionHost from "./pages/QodSessionHost";
// import JoinQod from "./pages/JoinQod";
// import QodRoom from "./pages/QodRoom";
// import QodSessionRoom from "./pages/QodSessionRoom";

// function App() {
//   return (
//     <BrowserRouter>
//       <AuthProvider>
//         <Routes>
//           {/* Public pages with the top bar (Senpaii on the left, buttons on the right) */}
//           <Route element={<PublicLayout />}>
//             <Route path="/" element={<JoinGame />} />
//             <Route path="/join" element={<JoinGame />} />
//             <Route path="/login" element={<Login />} />
//             <Route path="/register" element={<Register />} />
//             <Route path="/live-feedback" element={<JoinFeedback />} />
//             <Route path="/join-qod" element={<JoinQod />} />
//           </Route>

//           <Route path="/play/:sessionId" element={<PlayGame />} />

//           {/* Students: live feedback room (public, no login) */}
//           <Route path="/live-feedback/room" element={<FeedbackRoom />} />

//           {/* Students: join a live QOD session and the room itself (public, no login) */}
//           {/* <Route path="/join-qod" element={<JoinQod />} /> */}
//           <Route path="/qod/live/room" element={<QodRoom />} />
//           <Route path="/qod/session/room" element={<QodSessionRoom />} />

//           {/* Pages with the header and the left menu */}
//           <Route
//             element={
//               <ProtectedRoute>
//                 <AppLayout />
//               </ProtectedRoute>
//             }
//           >
//             <Route path="/dashboard" element={<Dashboard />} />
//             <Route path="/qod" element={<QuizOfTheDay />} />
//             {/* <Route path="/qod/regular" element={<QODRegular />} /> */}
//             {/* <Route path="/qod/live" element={<QODLive />} /> */}
//             <Route path="/sessions" element={<QuizSessions />} />
//             <Route path="/feedback" element={<Feedback />} />
//             <Route path="/feedback/live" element={<LiveFeedbackHome />} />
//             <Route path="/reports" element={<Reports />} />
//             <Route path="/reports/:sessionId" element={<ReportDetail />} />
//             <Route path="/reports/qod/:sessionId" element={<QodReportDetail />} />
//             <Route path="/session-complete/:sessionId" element={<GameFinished />} />
//             <Route path="/settings" element={<Settings />} />
//             <Route path="/trash" element={<Trash />} />
//           </Route>

//           {/* Full-screen pages (no sidebar) */}
//           <Route
//             path="/quiz/:quizId"
//             element={
//               <ProtectedRoute>
//                 <QuizEditor />
//               </ProtectedRoute>
//             }
//           />
//           <Route
//             path="/host/lobby/:sessionId"
//             element={
//               <ProtectedRoute>
//                 <HostLobby />
//               </ProtectedRoute>
//             }
//           />
//           <Route
//             path="/feedback/live/:pin"
//             element={
//               <ProtectedRoute>
//                 <LiveFeedbackHost />
//               </ProtectedRoute>
//             }
//           />
//           <Route
//             path="/qod/live/:pin"
//             element={
//               <ProtectedRoute>
//                 <QODLive />
//               </ProtectedRoute>
//             }
//           />
//           <Route path="/qod/session/:sessionId" 
//             element={
//               <ProtectedRoute>
//                 <QodSessionHost />
//               </ProtectedRoute>
//             } 
//           />
//             <Route
//             path="/qod/quiz/:qodQuizId"
//             element={
//               <ProtectedRoute>
//                 <QodQuizEditor />
//               </ProtectedRoute>
//             }
//           />
//         </Routes>
//       </AuthProvider>
//     </BrowserRouter>
//   );
// }

// export default App;


import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import PublicLayout from "./components/PublicLayout";

// Student-facing pages: a student can land on these cold, over a slow link, with
// no login — kept as regular (eager) imports so they're in the initial bundle.
import JoinGame from "./pages/JoinGame";
import PlayGame from "./pages/PlayGame";
import JoinQod from "./pages/JoinQod";
import QodRoom from "./pages/QodRoom";
import QodSessionRoom from "./pages/QodSessionRoom";
import JoinFeedback from "./pages/JoinFeedback";
import FeedbackRoom from "./pages/FeedbackRoom";

// Host-only pages (all behind login/ProtectedRoute, or rarely used): lazy-loaded so
// their code — including @hello-pangea/dnd, only used by the two quiz editors below —
// never has to cross a student's connection.
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const QuizOfTheDay = lazy(() => import("./pages/QuizOfTheDay"));
const QuizSessions = lazy(() => import("./pages/QuizSessions"));
const Feedback = lazy(() => import("./pages/Feedback"));
const LiveFeedbackHome = lazy(() => import("./pages/LiveFeedbackHome"));
const LiveFeedbackHost = lazy(() => import("./pages/LiveFeedbackHost"));
const Reports = lazy(() => import("./pages/Reports"));
const ReportDetail = lazy(() => import("./pages/ReportDetail"));
// const GameFinished = lazy(() => import("./pages/GameFinished"));
const Settings = lazy(() => import("./pages/Settings"));
const Trash = lazy(() => import("./pages/Trash"));
const QuizEditor = lazy(() => import("./pages/QuizEditor"));
const QodQuizEditor = lazy(() => import("./pages/QodQuizEditor"));
const QodReportDetail = lazy(() => import("./pages/QodReportDetail"));
const HostLobby = lazy(() => import("./pages/HostLobby"));
// import QODRegular from "./pages/QODRegular";
const QODLive = lazy(() => import("./pages/QODLive"));
const QodSessionHost = lazy(() => import("./pages/QodSessionHost"));

// Shown briefly while a lazy page's chunk downloads (host-side only, see above).
function PageLoading() {
  return <div className="min-h-screen bg-brand-bg text-white p-8">Loading...</div>;
}

function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* Public pages with the top bar (Senpaii on the left, buttons on the right) */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<JoinGame />} />
              <Route path="/join" element={<JoinGame />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/live-feedback" element={<JoinFeedback />} />
              <Route path="/join-qod" element={<JoinQod />} />
            </Route>

            <Route path="/play/:sessionId" element={<PlayGame />} />

            {/* Students: live feedback room (public, no login) */}
            <Route path="/live-feedback/room" element={<FeedbackRoom />} />

            {/* Students: join a live QOD session and the room itself (public, no login) */}
            {/* <Route path="/join-qod" element={<JoinQod />} /> */}
            <Route path="/qod/live/room" element={<QodRoom />} />
            <Route path="/qod/session/room" element={<QodSessionRoom />} />

            {/* Pages with the header and the left menu */}
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/qod" element={<QuizOfTheDay />} />
              {/* <Route path="/qod/regular" element={<QODRegular />} /> */}
              {/* <Route path="/qod/live" element={<QODLive />} /> */}
              <Route path="/sessions" element={<QuizSessions />} />
              <Route path="/feedback" element={<Feedback />} />
              <Route path="/feedback/live" element={<LiveFeedbackHome />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/reports/:sessionId" element={<ReportDetail />} />
              <Route path="/reports/qod/:sessionId" element={<QodReportDetail />} />
              {/* <Route path="/session-complete/:sessionId" element={<GameFinished />} /> */}
              <Route path="/settings" element={<Settings />} />
              <Route path="/trash" element={<Trash />} />
            </Route>

            {/* Full-screen pages (no sidebar) */}
            <Route
              path="/quiz/:quizId"
              element={
                <ProtectedRoute>
                  <QuizEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/host/lobby/:sessionId"
              element={
                <ProtectedRoute>
                  <HostLobby />
                </ProtectedRoute>
              }
            />
            <Route
              path="/feedback/live/:pin"
              element={
                <ProtectedRoute>
                  <LiveFeedbackHost />
                </ProtectedRoute>
              }
            />
            <Route
              path="/qod/live/:pin"
              element={
                <ProtectedRoute>
                  <QODLive />
                </ProtectedRoute>
              }
            />
            <Route
              path="/qod/session/:sessionId"
              element={
                <ProtectedRoute>
                  <QodSessionHost />
                </ProtectedRoute>
              }
            />
            <Route
              path="/qod/quiz/:qodQuizId"
              element={
                <ProtectedRoute>
                  <QodQuizEditor />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
