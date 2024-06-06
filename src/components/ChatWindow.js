import React, { useReducer, useEffect, useState } from 'react';
import axios from 'axios';
import './ChatWindow.css'; // Ensure this import is at the top of your file

const initialState = {
  messages: []
};

function reducer(state, action) {
  switch (action.type) {
    case 'add_message':
      return { messages: [...state.messages, action.payload] };
    case 'add_response':
      return { messages: [...state.messages, action.payload] };
    default:
      throw new Error();
  }
}

const ChatWindow = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const sendMessage = async () => {
    if (!input || isSending) return;

    const newMessage = { role: 'user', content: input };
    dispatch({ type: 'add_message', payload: newMessage });
    console.log('Sending message:', newMessage);

    setInput('');  // Clear the input field immediately
    setIsSending(true);

    try {
      const response = await axios.post('http://localhost:5000/chat', { message: newMessage.content });
      console.log('Response received:', response.data);
      dispatch({ type: 'add_response', payload: response.data });
    } catch (error) {
      console.error('Error sending message:', error.toJSON ? error.toJSON() : error);
      dispatch({ type: 'add_response', payload: { role: 'assistant', content: 'Error sending message' } });
    } finally {
      setIsSending(false);
    }
  };

  useEffect(() => {
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
      chatWindow.scrollTop = chatWindow.scrollHeight;
    }
  }, [state.messages]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') sendMessage();
  };

  return (
    <div className="chat-container">
      <div id="chat-window" className="chat-window">
        {state.messages.map((msg, index) => (
          <div key={index} className={`chat-message ${msg.role}`}>
            <p>{msg.content}</p>
          </div>
        ))}
      </div>
      <div className="chat-input-container">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          className="chat-input"
          disabled={isSending}
        />
        <button onClick={sendMessage} className="chat-send-button" disabled={isSending}>
          {isSending ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default ChatWindow;
