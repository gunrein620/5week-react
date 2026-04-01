// ── PostCard.js ───────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState, useEffect } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { api } from '../services/api.js';

export function PostCard({ post, onUpdate, isArchiveView = false }) {
  beginComponent(`PostCard_${post.id}`);

  const username = localStorage.getItem('username') || '';
  const hasLiked = post.likedBy && post.likedBy.includes(username);
  const isArchived = Boolean(isArchiveView && post.isExpired);
  const shouldShowTtl = !isArchived;

  // 클라이언트 TTL (서버 TTL을 초기값으로, 매초 감소)
  const [ttl, setTtl] = useState(post.ttl);
  const [liking, setLiking] = useState(false);

  // 서버에서 새 포스트 데이터 오면 TTL 동기화
  useEffect(() => {
    setTtl(post.ttl);
  }, [post.ttl, post.id]);

  // 1초마다 TTL 감소 — useEffect + setInterval 핵심 활용
  useEffect(() => {
    if (!shouldShowTtl) return undefined;
    const timer = setInterval(() => {
      setTtl(prev => {
        const next = prev - 1;
        return next;
      });
    }, 1000);
    return () => clearInterval(timer); // cleanup: 컴포넌트 소멸 시 타이머 정리
  }, [post.id, shouldShowTtl]);

  endComponent();

  const displayTtl = Math.max(0, Math.ceil(ttl));
  const maxTtl = 15; // 프로그레스바 기준 최대값
  const pct = shouldShowTtl ? Math.min(100, Math.max(0, (ttl / maxTtl) * 100)) : 100;
  const urgency = isArchived ? 'archived' : ttl > 7 ? 'green' : ttl > 4 ? 'yellow' : 'red';
  const opacity = isArchived ? 1 : Math.max(0.35, Math.min(1, ttl / 8));

  const handleLike = async (e) => {
    e.stopPropagation();
    if (isArchived || hasLiked || liking) return;
    setLiking(true);
    try {
      const data = await api.post(`/api/posts/${post.id}/like`, { username });
      if (data.ok && onUpdate) onUpdate(data);
    } finally {
      setLiking(false);
    }
  };

  return createElement('div', {
    class: `post-card post-card--${urgency}`,
    'data-key': post.id,
    style: `opacity: ${opacity}`,
  },
    // 이미지 + 텍스트 오버레이
    createElement('div', { class: 'post-card__media' },
      post.imageData
        ? createElement('img', { class: 'post-card__image', src: post.imageData, alt: '' })
        : createElement('div', { class: 'post-card__no-image' }),
      post.text
        ? createElement('div', { class: 'post-card__overlay' },
            createElement('p', { class: 'post-card__text' }, post.text)
          )
        : createElement('span', {})
    ),
    // 하단 정보
    createElement('div', { class: 'post-card__footer' },
      createElement('span', { class: 'post-card__author' }, `@${post.author}`),
      shouldShowTtl
        ? createElement('div', { class: 'post-card__ttl-row' },
            createElement('div', { class: 'post-card__ttl-bar' },
              createElement('div', {
                class: `post-card__ttl-fill post-card__ttl-fill--${urgency}`,
                style: `width: ${pct}%`,
              })
            ),
            createElement('span', { class: `post-card__ttl-text post-card__ttl-text--${urgency}` },
              `${displayTtl}s`
            )
          )
        : createElement('div', { class: 'post-card__archive-row' },
            createElement('span', { class: 'post-card__badge' }, '보관됨'),
            createElement('span', { class: 'post-card__meta' }, `좋아요 ${post.likes}`)
          ),
      !isArchived
        ? createElement('button', {
            class: `post-card__like-btn${hasLiked ? ' post-card__like-btn--liked' : ''}${liking ? ' post-card__like-btn--loading' : ''}`,
            onClick: handleLike,
            title: hasLiked ? '이미 좋아요를 눌렀습니다' : '좋아요 (+3초)',
          },
            createElement('span', { class: 'post-card__like-icon' }, '♥'),
            createElement('span', { class: 'post-card__like-count' }, String(post.likes))
          )
        : createElement('span', {})
    )
  );
}
