// ── Feed.js ───────────────────────────────────────────────────────────────────
import { createElement } from '../framework/vdom.js';
import { useState, useEffect } from '../framework/hooks.js';
import { beginComponent, endComponent } from '../framework/component.js';
import { PostCard } from './PostCard.js';
import { api } from '../services/api.js';

export function Feed() {
  beginComponent('Feed');
  const [livePosts, setLivePosts] = useState([]);
  const [myPosts, setMyPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('live');
  const username = localStorage.getItem('username') || '';

  const syncPosts = (data) => {
    if (Array.isArray(data.livePosts) || Array.isArray(data.myPosts)) {
      setLivePosts(data.livePosts || []);
      setMyPosts(data.myPosts || []);
      return;
    }

    const fallbackPosts = data.posts || [];
    setLivePosts(fallbackPosts);
    setMyPosts(fallbackPosts.filter(post => post.author === username));
  };

  // 피드 진입 시 초기 로드 — useEffect: deps=[] → 마운트 1회
  useEffect(() => {
    api.get(`/api/posts?username=${encodeURIComponent(username)}`)
      .then(data => {
        syncPosts(data);
        setLoading(false);
      });
  }, [username]);

  // 3초마다 서버에서 피드를 다시 불러옴 (만료된 포스트 정리 + 좋아요 동기화)
  // useEffect + setInterval: cleanup으로 타이머 정리
  useEffect(() => {
    const timer = setInterval(() => {
      api.get(`/api/posts?username=${encodeURIComponent(username)}`).then(data => {
        syncPosts(data); // 서버 TTL로 갱신 → diff → patch (만료된 포스트 REMOVE)
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [username]);

  endComponent();

  const handleUpdate = (data) => {
    syncPosts(data);
  };

  const visiblePosts = activeTab === 'mine' ? myPosts : livePosts;
  const isMineTab = activeTab === 'mine';
  const emptyTitle = isMineTab ? '아직 내가 올린 글이 없어요' : '올라온 소식이 없어요';
  const emptySub = isMineTab
    ? '새 순간을 공유하면 여기서 따로 모아볼 수 있어요'
    : '가장 먼저 순간을 남겨보세요';

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
      }, `실시간 올라오는 글 ${livePosts.length}`),
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'mine' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'mine' ? 'true' : 'false',
        onClick: () => setActiveTab('mine'),
      }, `내가 올린 글 ${myPosts.length}`)
    ),
    createElement('div', {
      class: isMineTab ? 'feed-panel feed-panel--mine' : 'feed-panel feed-panel--live',
      'data-key': isMineTab ? 'mine-panel' : 'live-panel',
    },
      visiblePosts.length === 0
        ? createElement('div', {
            class: 'feed-empty',
            'data-key': isMineTab ? 'mine-empty' : 'live-empty',
          },
            createElement('div', { class: 'feed-empty__icon' }, isMineTab ? '🫥' : '🔥'),
            createElement('p', { class: 'feed-empty__title' }, emptyTitle),
            createElement('p', { class: 'feed-empty__sub' }, emptySub)
          )
        : createElement('div', {
            class: 'feed-grid',
            'data-key': isMineTab ? 'mine-grid' : 'live-grid',
          },
          ...visiblePosts.map(post =>
            PostCard({ post, onUpdate: handleUpdate, isArchiveView: isMineTab })
          )
        )
    )
  );
}
