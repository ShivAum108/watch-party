import { useEffect } from "react"
import { socket } from "./socket"
import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Room from "./pages/Room";


function App() {

  useEffect(() => {
    socket.on("connect", () => {
      console.log("connected:", socket.id);
    })
  }, []);
  
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/room/:roomId" element={<Room />} />
    </Routes>
  )
}

export default App