import { useState } from 'react'
import { useNavigate } from 'react-router-dom';

function Home() {
  const [userName, setUserName] = useState("");
  const [roomId, setRoomId] = useState("");
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!userName || !roomId) return;
    navigate(`/room/${roomId}?username=${userName}`);
  }
  return (
    <div className='border min-h-screen px-2 bg-linear-to-br from-indigo-100 to-purple-200 flex justify-center items-center gap-4'>
      <div className='bg-white shadow-xl rounded-2xl p-8 w-87.5 flex flex-col gap-5'>
        <h1 className='text-2xl font-bold text-gray-800 text-center'>Watch Party</h1>
        <div className='flex flex-col gap-1'>
          <label htmlFor="username" className='text-sm text-gray-600'>Username</label>
          <input type="text" name='username' placeholder='Enter username' className='border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none px-3 py-2 rounded-lg transition' onChange={(e) => setUserName(e.target.value)} />
        </div>
        <div className='flex flex-col gap-1'>
          <label htmlFor="roomId" className='text-sm text-gray-600'>RoomId</label>
          <input type="text" placeholder='Enter room ID' className='border border-gray-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none px-3 py-2 rounded' onChange={(e) => setRoomId(e.target.value)} />
        </div>
        <button onClick={handleJoin} className='border bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-2 py-2 rounded-lg transition duration-200 shadow-md hover:shadow-lg cursor-pointer'>Join Room</button>
        <p className="text-xs text-gray-400 text-center">
          Enter a room ID to join or create one
        </p>
      </div>
    </div>
  )
}

export default Home