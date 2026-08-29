// main.jsx — 앱 진입점. React를 브라우저 DOM에 연결하고 라우터를 설치한다.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './styles/index.css' // 전체 스타일(토큰 포함)

// '#root' div에 앱을 마운트한다
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* BrowserRouter: 주소(URL)에 따라 화면을 바꿔주는 라우터 */}
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
