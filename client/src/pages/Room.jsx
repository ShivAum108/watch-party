import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Player from "../components/Player";
import { socket } from "../socket";

function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const hasJoined = useRef(false);

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const username = query.get("username");

  const [participants, setParticipants] = useState([]);
  const [joinError, setJoinError] = useState("");
  const [copied, setCopied] = useState(false);

  const currentUser = participants.find((p) => p.id === socket.id);
  const isHost = currentUser?.role === "host";

  useEffect(() => {
    if (!roomId || !username?.trim()) {
      navigate("/");
      return;
    }

    if (hasJoined.current) return;
    hasJoined.current = true;

    const handleParticipantsPayload = ({ participants = [] }) => {
      setParticipants(participants);
    };

    const handleUserJoined = ({ participants = [] }) => {
      setParticipants(participants);
    };

    const handleUserLeft = ({ participants = [] }) => {
      setParticipants(participants);
    };

    const handleRoleAssigned = ({ participants = [] }) => {
      setParticipants(participants);
    };

    const handleParticipantRemoved = ({ participants = [] }) => {
      setParticipants(participants);
    };

    const handleKicked = () => {
      alert("You were removed by the host");
      navigate("/");
    };

    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("role_assigned", handleRoleAssigned);
    socket.on("participant_removed", handleParticipantRemoved);
    socket.on("participants_updated", handleParticipantsPayload);
    socket.on("kicked", handleKicked);

    socket.emit("join_room", { roomId, username: username.trim() }, (response) => {
      if (!response?.ok) {
        setJoinError(response?.message || "Unable to join room");
        alert(response?.message || "Unable to join room");
        navigate("/");
        return;
      }

      if (response.participants) {
        setParticipants(response.participants);
      }
    });

    const handleBeforeUnload = () => {
      socket.emit("leave_room", { roomId });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      socket.emit("leave_room", { roomId });

      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("role_assigned", handleRoleAssigned);
      socket.off("participant_removed", handleParticipantRemoved);
      socket.off("participants_updated", handleParticipantsPayload);
      socket.off("kicked", handleKicked);

      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [roomId, username, navigate]);

  const handleAssignRole = (userId, role) => {
    socket.emit("assign_role", {
      roomId,
      userId,
      role,
    });
  };

  const handleRemove = (userId) => {
    const confirmRemove = window.confirm("Are you sure you want to remove this participant?");
    if (!confirmRemove) return;

    socket.emit("remove_participant", {
      roomId,
      userId,
    });
  };

  const handleLeave = () => {
    socket.emit("leave_room", { roomId });
    navigate("/");
  };

  const handleCopyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-indigo-900 text-white px-4 sm:px-6 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 flex justify-end">
          <button
            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm sm:text-base font-semibold cursor-pointer rounded-lg transition"
            onClick={handleLeave}
          >
            Leave Room
          </button>
        </div>

        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">YouTube Watch Party</h1>
            <p className="text-sm text-slate-300 mt-1">
              Watch together in sync with role-based controls.
            </p>
          </div>

          <div className="bg-white/10 px-4 py-3 rounded-xl backdrop-blur w-full sm:w-auto border border-white/10">
            <span className="text-xs text-gray-300">Room ID</span>
            <div className="flex items-center gap-2 mt-1">
              <p className="font-semibold text-indigo-300 break-all">{roomId}</p>
              <button
                onClick={handleCopyRoomId}
                className="px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 transition cursor-pointer"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>

        {joinError && (
          <div className="mb-4 rounded-lg bg-red-500/20 border border-red-400/30 px-4 py-3 text-red-200">
            {joinError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white/10 backdrop-blur rounded-2xl p-4 shadow-xl border border-white/10">
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-indigo-300">Now Playing</h2>

              <div className="text-xs sm:text-sm text-slate-300">
                Your role:{" "}
                <span
                  className={`font-semibold ${
                    currentUser?.role === "host"
                      ? "text-green-300"
                      : currentUser?.role === "moderator"
                      ? "text-yellow-300"
                      : "text-blue-300"
                  }`}
                >
                  {currentUser?.role || "joining..."}
                </span>
              </div>
            </div>

            <div className="w-full bg-black rounded-xl p-3 flex flex-col items-center">
              <div className="w-full rounded-xl flex items-center justify-center">
                <Player roomId={roomId} role={currentUser?.role} />
              </div>
            </div>

            <div className="mt-4 text-sm text-slate-300">
              {(currentUser?.role === "host" || currentUser?.role === "moderator") && (
                <p>You can control play, pause, sync, and change video.</p>
              )}
              {currentUser?.role === "participant" && (
                <p>You can watch in sync. Only host or moderator can control playback.</p>
              )}
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-2xl p-4 shadow-xl border border-white/10">
            <h3 className="text-lg font-semibold mb-4 text-indigo-300">
              Participants ({participants.length})
            </h3>

            <div className="flex flex-col gap-3 max-h-105 overflow-y-auto pr-1">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center bg-white/5 px-3 py-3 rounded-lg hover:bg-white/10 transition gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {p.username} {p.id === socket.id ? "(You)" : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <span
                      className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${
                        p.role === "host"
                          ? "bg-green-500/20 text-green-300"
                          : p.role === "moderator"
                          ? "bg-yellow-500/20 text-yellow-300"
                          : "bg-blue-500/20 text-blue-300"
                      }`}
                    >
                      {p.role}
                    </span>

                    {isHost && p.id !== socket.id && (
                      <>
                        {p.role !== "moderator" && (
                          <button
                            onClick={() => handleAssignRole(p.id, "moderator")}
                            className="px-2 py-1 text-xs rounded-lg bg-yellow-600 hover:bg-yellow-700 text-white cursor-pointer transition"
                          >
                            Make moderator
                          </button>
                        )}

                        {p.role !== "participant" && p.role !== "host" && (
                          <button
                            onClick={() => handleAssignRole(p.id, "participant")}
                            className="px-2 py-1 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white cursor-pointer transition"
                          >
                            Make participant
                          </button>
                        )}

                        {p.role !== "host" && (
                          <button
                            onClick={() => handleAssignRole(p.id, "host")}
                            className="px-2 py-1 text-xs rounded-lg bg-green-600 hover:bg-green-700 text-white cursor-pointer transition"
                          >
                            Make host
                          </button>
                        )}

                        <button
                          className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 rounded cursor-pointer transition"
                          onClick={() => handleRemove(p.id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {participants.length === 0 && (
              <p className="text-sm text-gray-400 text-center mt-4">No participants yet...</p>
            )}

            <div className="mt-5 rounded-lg bg-white/5 p-3 text-xs text-slate-300 border border-white/5">
              <p className="mb-1 font-semibold text-slate-200">Role Rules</p>
              <p>Host: full room control</p>
              <p>Moderator: playback control</p>
              <p>Participant: watch only</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Room;