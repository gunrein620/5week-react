// ── Feed.js ───────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState, useEffect } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { PostCard } from './PostCard.js';
import { api } from '../services/api.js';

export function Feed() {
  beginComponent('Feed');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('live');
  const username = localStorage.getItem('username') || '';

  // 피드 진입 시 초기 로드 — useEffect: deps=[] → 마운트 1회
  useEffect(() => {
    api.get('/api/posts').then(data => {
      setPosts(data.posts);
      setLoading(false);
    });
  }, []);

  // 3초마다 서버에서 피드를 다시 불러옴 (만료된 포스트 정리 + 좋아요 동기화)
  // useEffect + setInterval: cleanup으로 타이머 정리
  useEffect(() => {
    const timer = setInterval(() => {
      api.get('/api/posts').then(data => {
        setPosts(data.posts); // 서버 TTL로 갱신 → diff → patch (만료된 포스트 REMOVE)
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  endComponent();

  const handleUpdate = (newPosts) => {
    setPosts(newPosts);
  };

  const myPosts = posts.filter(post => post.author === username);
  const visiblePosts = activeTab === 'mine' ? myPosts : posts;

  if (loading) {
    return createElement('div', { class: 'feed-loading' },
      createElement('div', { class: 'spinner' }),
      createElement('p', {}, '불러오는 중...')
    );
  }

  return createElement('section', { class: 'feed-page' },
    createElement('div', { class: 'feed-tabs', role: 'tablist', 'aria-label': '피드 보기 전환' },
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'live' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'live' ? 'true' : 'false',
        onClick: () => setActiveTab('live'),
      }, `실시간 올라오는 글 ${posts.length}`),
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'mine' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'mine' ? 'true' : 'false',
        onClick: () => setActiveTab('mine'),
      }, `내가 올린 글 ${myPosts.length}`)
    ),
    visiblePosts.length === 0
      ? createElement('div', { class: 'feed-empty' },
          createElement('div', { class: 'feed-empty__icon' }, activeTab === 'mine' ? '🫥' : '🔥'),
          createElement(
            'p',
            { class: 'feed-empty__title' },
            activeTab === 'mine' ? '아직 내가 올린 글이 없어요' : '아직 아무것도 없어요'
          ),
          createElement(
            'p',
            { class: 'feed-empty__sub' },
            activeTab === 'mine'
              ? '새 순간을 공유하면 여기서 따로 모아볼 수 있어요'
              : '첫 번째 순간을 공유해보세요'
          )
        )
      : createElement('div', { class: 'feed-grid' },
          ...visiblePosts.map(post =>
            PostCard({ post, onUpdate: handleUpdate })
          )
        )
  );
}
