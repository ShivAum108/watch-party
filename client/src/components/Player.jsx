import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import YouTube from "react-youtube";
import { socket } from "../socket";

function Player({ roomId, role }) {
  const playerRef = useRef(null);
  const pendingActionRef = useRef(null);

  const [videoId, setVideoId] = useState("aIIEI33EUqI");
  const [videoInput, setVideoInput] = useState("");
  const [syncNotice, setSyncNotice] = useState("");
  const [playerReady, setPlayerReady] = useState(false);
  const [interactionEnabled, setInteractionEnabled] = useState(role === "host" || role === "moderator");

  const canControl = role === "host" || role === "moderator";

  const opts = useMemo(
    () => ({
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        controls: 1,
        disablekb: canControl ? 0 : 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
    }),
    [canControl]
  );

  const showNotice = (message) => {
    setSyncNotice(message);
    setTimeout(() => setSyncNotice(""), 2200);
  };

  const getSafeCurrentTime = () => {
    try {
      return Number(playerRef.current?.getCurrentTime?.() || 0);
    } catch {
      return 0;
    }
  };

  const seekSafely = (time) => {
    try {
      if (!playerRef.current) return;
      const safeTime = typeof time === "number" && !Number.isNaN(time) ? time : 0;
      playerRef.current.seekTo(safeTime, true);
    } catch (error) {
      console.error("seekSafely error:", error);
    }
  };

  const playSafely = () => {
    try {
      playerRef.current?.playVideo?.();
    } catch (error) {
      console.error("playSafely error:", error);
    }
  };

  const pauseSafely = () => {
    try {
      playerRef.current?.pauseVideo?.();
    } catch (error) {
      console.error("pauseSafely error:", error);
    }
  };

  const muteSafely = () => {
    try {
      playerRef.current?.mute?.();
    } catch (error) {
      console.error("muteSafely error:", error);
    }
  };

  const unMuteSafely = () => {
    try {
      playerRef.current?.unMute?.();
    } catch (error) {
      console.error("unMuteSafely error:", error);
    }
  };

  const loadVideoSafely = (nextVideoId) => {
    try {
      if (!playerRef.current || !nextVideoId) return;
      playerRef.current.loadVideoById(nextVideoId);
    } catch (error) {
      console.error("loadVideoSafely error:", error);
    }
  };

  const extractVideoId = (input) => {
    if (!input) return "";

    const trimmed = input.trim();

    const patterns = [
      /[?&]v=([^&#]+)/,
      /youtu\.be\/([^?&#/]+)/,
      /youtube\.com\/embed\/([^?&#/]+)/,
      /youtube\.com\/shorts\/([^?&#/]+)/,
      /youtube\.com\/watch\?v=([^&#]+)/,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match?.[1]) return match[1];
    }

    return trimmed;
  };

  const runPendingAction = useCallback(() => {
    if (!playerRef.current || !playerReady) return;
    if (!pendingActionRef.current) return;

    const action = pendingActionRef.current;
    pendingActionRef.current = null;

    if (action.type === "play") {
      if (typeof action.currentTime === "number") {
        seekSafely(action.currentTime);
      }
      if (!canControl) muteSafely();
      setTimeout(() => {
        playSafely();
      }, 250);
      return;
    }

    if (action.type === "pause") {
      if (typeof action.currentTime === "number") {
        seekSafely(action.currentTime);
      }
      setTimeout(() => {
        pauseSafely();
      }, 120);
      return;
    }

    if (action.type === "seek") {
      seekSafely(action.time);
      return;
    }

    if (action.type === "change_video") {
      setVideoId(action.videoId);
      loadVideoSafely(action.videoId);
      return;
    }

    if (action.type === "sync_state") {
      const nextVideoId = action.state.videoId || "aIIEI33EUqI";
      const time =
        typeof action.state.currentTime === "number" ? action.state.currentTime : 0;

      setVideoId(nextVideoId);
      loadVideoSafely(nextVideoId);

      setTimeout(() => {
        seekSafely(time);

        if (action.state.isPlaying) {
          if (!canControl) muteSafely();
          playSafely();
        } else {
          pauseSafely();
        }
      }, 450);
    }
  }, [playerReady, canControl]);

  const onReady = useCallback(
    (event) => {
      playerRef.current = event.target;
      setPlayerReady(true);

      if (!canControl) {
        try {
          playerRef.current.mute();
        } catch (error) {
          console.error("mute on ready error:", error);
        }
      }

      setTimeout(() => {
        runPendingAction();
      }, 200);
    },
    [canControl, runPendingAction]
  );

  useEffect(() => {
    if (canControl) {
      setInteractionEnabled(true);
    }
  }, [canControl]);

  const requireReadyOrQueue = (action) => {
    if (!playerRef.current || !playerReady) {
      pendingActionRef.current = action;
      return false;
    }

    if (!canControl && !interactionEnabled) {
      pendingActionRef.current = action;
      showNotice("Click Enable Sync once on this browser");
      return false;
    }

    return true;
  };

  const handleEnableSync = () => {
    setInteractionEnabled(true);

    try {
      muteSafely();
      playSafely();
      setTimeout(() => {
        pauseSafely();
        runPendingAction();
      }, 200);
    } catch (error) {
      console.error("Enable sync error:", error);
    }
  };

  const handlePlay = () => {
    if (!canControl || !playerRef.current) return;

    const currentTime = getSafeCurrentTime();
    unMuteSafely();
    playSafely();
    socket.emit("play", { roomId, currentTime });
  };

  const handlePause = () => {
    if (!canControl || !playerRef.current) return;

    const currentTime = getSafeCurrentTime();
    pauseSafely();
    socket.emit("pause", { roomId, currentTime });
  };

  const handleSync = () => {
    if (!canControl || !playerRef.current) return;

    const time = getSafeCurrentTime();
    seekSafely(time);
    socket.emit("seek", { roomId, time });
  };

  const handleChangeVideo = () => {
    if (!canControl) return;

    const input = window.prompt("Enter YouTube URL or video ID:", videoInput || "");
    if (!input) return;

    const nextVideoId = extractVideoId(input);
    if (!nextVideoId) {
      alert("Invalid YouTube URL or video ID");
      return;
    }

    setVideoInput(input);
    setVideoId(nextVideoId);
    socket.emit("change_video", { roomId, videoId: nextVideoId });
  };

  const handleUnmute = () => {
    unMuteSafely();
  };

  useEffect(() => {
    const onPlay = ({ currentTime } = {}) => {
      const action = { type: "play", currentTime };

      if (!requireReadyOrQueue(action)) return;

      if (typeof currentTime === "number") {
        seekSafely(currentTime);
      }

      if (!canControl) {
        muteSafely();
      }

      setTimeout(() => {
        playSafely();

        if (!canControl) {
          showNotice("Playback synced");
        }
      }, 250);
    };

    const onPause = ({ currentTime } = {}) => {
      const action = { type: "pause", currentTime };

      if (!requireReadyOrQueue(action)) return;

      if (typeof currentTime === "number") {
        seekSafely(currentTime);
      }

      setTimeout(() => {
        pauseSafely();
      }, 120);
    };

    const onSeek = ({ time }) => {
      const action = { type: "seek", time };

      if (!requireReadyOrQueue(action)) return;
      if (typeof time !== "number") return;

      seekSafely(time);
    };

    const onChangeVideo = ({ videoId: nextVideoId }) => {
      const action = { type: "change_video", videoId: nextVideoId };

      if (!requireReadyOrQueue(action)) return;
      if (!nextVideoId) return;

      setVideoId(nextVideoId);
      loadVideoSafely(nextVideoId);

      if (!canControl) {
        setTimeout(() => {
          muteSafely();
        }, 250);
      }
    };

    const onSyncState = (state) => {
      const action = { type: "sync_state", state };

      if (!requireReadyOrQueue(action)) return;
      if (!state) return;

      const nextVideoId = state.videoId || "aIIEI33EUqI";
      const time = typeof state.currentTime === "number" ? state.currentTime : 0;

      setVideoId(nextVideoId);
      loadVideoSafely(nextVideoId);

      setTimeout(() => {
        seekSafely(time);

        if (state.isPlaying) {
          if (!canControl) {
            muteSafely();
          }
          playSafely();

          if (!canControl) {
            showNotice("Joined in sync");
          }
        } else {
          pauseSafely();
        }
      }, 450);
    };

    socket.on("play", onPlay);
    socket.on("pause", onPause);
    socket.on("seek", onSeek);
    socket.on("change_video", onChangeVideo);
    socket.on("sync_state", onSyncState);

    return () => {
      socket.off("play", onPlay);
      socket.off("pause", onPause);
      socket.off("seek", onSeek);
      socket.off("change_video", onChangeVideo);
      socket.off("sync_state", onSyncState);
    };
  }, [roomId, canControl, interactionEnabled, playerReady]);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-full aspect-video">
        <YouTube
          videoId={videoId}
          opts={opts}
          onReady={onReady}
          className="w-full h-full"
          iframeClassName="w-full h-full rounded-xl"
        />

        {!canControl && (
          <div
            className="absolute inset-0 z-10 cursor-not-allowed"
            title="Only host/moderator can control playback"
          />
        )}
      </div>

      {syncNotice && (
        <div className="mt-3 text-xs sm:text-sm text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 rounded-lg text-center">
          {syncNotice}
        </div>
      )}

      {!canControl && !interactionEnabled && (
        <button
          onClick={handleEnableSync}
          className="mt-3 px-4 py-2 text-sm rounded bg-green-600 hover:bg-green-700 transition cursor-pointer"
        >
          Enable Sync
        </button>
      )}

      {!canControl && interactionEnabled && (
        <button
          onClick={handleUnmute}
          className="mt-3 px-3 py-1 text-sm rounded bg-indigo-600 hover:bg-indigo-700 transition cursor-pointer"
        >
          Unmute
        </button>
      )}

      <div className="mt-4 flex flex-wrap justify-center gap-2 sm:gap-3">
        <button
          onClick={handlePlay}
          disabled={!canControl}
          className="border px-3 py-1 text-sm sm:text-base rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10 transition"
        >
          Play
        </button>

        <button
          onClick={handlePause}
          disabled={!canControl}
          className="border px-3 py-1 text-sm sm:text-base rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10 transition"
        >
          Pause
        </button>

        <button
          onClick={handleSync}
          disabled={!canControl}
          className="border px-3 py-1 text-sm sm:text-base rounded disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10 transition"
        >
          Sync
        </button>

        <button
          onClick={handleChangeVideo}
          disabled={!canControl}
          className="border px-3 py-1 text-sm sm:text-base rounded whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:bg-white/10 transition"
        >
          Change Video
        </button>
      </div>
    </div>
  );
}

export default Player;