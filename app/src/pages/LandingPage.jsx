// pages/LandingPage.jsx — 비로그인 방문자를 위한 소개 화면(랜딩)
// 기존 navy 디자인 시스템(tokens.css)을 그대로 쓰되, 소개용 섹션만 별도 CSS(land-*)로 꾸민다.
// Hallmark · macrostructure: Letter · genre: warm-friendly · theme: existing navy system

import { Link } from 'react-router-dom'

const buyPoints = [
  '배송비를 모인 인원이 함께 나눠 부담해요',
  '최소수량이 필요할 땐 동네에서 이웃을 모아요',
  '마감(인원 · 기간)은 등록자가 정해요',
  '집결 뒤엔 도착 현황과 쪽지를 실시간으로 확인해요',
]

const rentPoints = [
  '빌리고 싶은 물건을 올리면, 이웃이 "빌려드릴게요"라고 제안해요',
  '마음에 드는 제안을 고르면 매칭, 대여 → 반납까지 이어져요',
  '같은 동네라서 주고받기도 부담이 없어요',
]

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="land-header">
        <div className="container land-header-in">
          <Link to="/" className="land-logo"><img src="/logo.svg" alt="" className="land-logo-img" aria-hidden="true" />공모집</Link>
          <nav className="land-nav">
            <Link to="/login" className="btn btn-outline btn-sm">로그인</Link>
            <Link to="/signup" className="btn btn-sm">시작하기</Link>
          </nav>
        </div>
      </header>

      <section className="land-hero">
        <div className="container land-hero-in">
          <p className="land-eyebrow">소규모 가구를 위한 동네 나눔</p>
          <h1 className="land-title">안 사도 돼요.<br />같이 사도 돼요.</h1>
          <p className="land-lead">
            공모집은 이웃과 <strong>함께 사고</strong>(공동구매), 서로 <strong>빌려 쓰는</strong>(대여)
            동네 나눔 서비스예요. 가끔 필요한 물건을 혼자 다 살 필요가 없어요.
          </p>
          <div className="land-cta">
            <Link to="/signup" className="btn btn-big">무료로 시작하기</Link>
            <Link to="/login" className="btn btn-outline btn-big">계정이 있으세요? 로그인</Link>
          </div>
          <ul className="land-chips" aria-label="서비스 특징">
            <li>배송비는 모두가 나눠요</li>
            <li>안 쓰는 물건, 기간만 빌려드려요</li>
            <li>집결 후엔 도착 현황을 확인해요</li>
          </ul>
        </div>
      </section>

      <section className="land-how">
        <div className="container">
          <div className="land-sec-head">
            <h2>이렇게 시작해요</h2>
            <p>복잡한 절차 없이 세 걸음이면 충분해요.</p>
          </div>
          <ol className="land-steps">
            <li className="land-step">
              <span className="land-step-num" aria-hidden="true">01</span>
              <h3>물건 올리기</h3>
              <p>필요한 물품과 가격, 모이는 위치를 정해서 올려요.</p>
            </li>
            <li className="land-step">
              <span className="land-step-num" aria-hidden="true">02</span>
              <h3>이웃과 모으기</h3>
              <p>원하는 인원이 모이거나, 정한 시각까지. 제한 없이도 모집할 수 있어요.</p>
            </li>
            <li className="land-step">
              <span className="land-step-num" aria-hidden="true">03</span>
              <h3>함께 받아요</h3>
              <p>모이면 같이 배송받고, 쪽지로 진행 상황을 주고받아요.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="land-svc">
        <div className="container land-svc-grid">
          <article className="land-panel land-panel-buy">
            <span className="land-panel-chip">함께 사기</span>
            <h2>공동구매</h2>
            <p className="land-panel-lead">
              선물할 때, 대량만 파는 물건일 때. 이웃이 모이면 그동안 포기했던 사기를 시작할 수 있어요.
            </p>
            <ul className="land-points">
              {buyPoints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
          <article className="land-panel land-panel-rent">
            <span className="land-panel-chip">사지 않고 쓰기</span>
            <h2>대여</h2>
            <p className="land-panel-lead">
              드릴 한 번, 텐트 한 번. 일 년에 두 번 쓸 물건을 사느니 이웃에게 기간만 빌려 쓰는 거예요.
            </p>
            <ul className="land-points">
              {rentPoints.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="land-final">
        <div className="container land-final-in">
          <h2>우리 동네에서, 오늘부터 시작해요</h2>
          <Link to="/signup" className="btn btn-big">무료로 시작하기</Link>
        </div>
      </section>

      <footer className="land-footer">
        <div className="container land-footer-in">
          <span className="land-logo"><img src="/logo.svg" alt="" className="land-logo-img" aria-hidden="true" />공모집</span>
          <span className="land-footer-note">소규모 가구를 위한 동네 나눔</span>
          <span className="land-footer-copy">© 2026 공모집</span>
        </div>
      </footer>
    </div>
  )
}