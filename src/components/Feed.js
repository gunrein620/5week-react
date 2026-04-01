// ── Feed.js ───────────────────────────────────────────────────────────────────
// 순수 함수 컴포넌트: 상태 없음, 부모(App)로부터 props만 받아 렌더링합니다.

import { createElement } from '../framework/vdom.js';
import { PostCard } from './PostCard.js';

export function Feed({
  livePosts = [],
  myPosts = [],
  popularPosts = [],
  activeTab = 'live',
  postTtls = {},
  likingPosts = {},
  username = '',
  onTabChange,
  onLike,
} = {}) {
  const isMineTab = activeTab === 'mine';
  const isPopularTab = activeTab === 'popular';

  const visiblePosts = isMineTab ? myPosts : isPopularTab ? popularPosts : livePosts;

  const emptyTitle = isMineTab
    ? '아직 내가 올린 글이 없어요'
    : isPopularTab
    ? '아직 좋아요를 받은 글이 없어요'
    : '올라온 소식이 없어요';
  const emptySub = isMineTab
    ? '새 순간을 공유하면 여기서 따로 모아볼 수 있어요'
    : isPopularTab
    ? '게시물에 좋아요를 눌러 순위를 만들어보세요'
    : '가장 먼저 순간을 남겨보세요';

  return createElement('section', { class: 'feed-page' },
    createElement('div', { class: 'feed-tabs', role: 'tablist', 'aria-label': '피드 보기 전환' },
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'live' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'live' ? 'true' : 'false',
        onClick: () => onTabChange && onTabChange('live'),
      }, '실시간', createElement('span', { class: 'tab-badge' }, String(livePosts.length))),
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'popular' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'popular' ? 'true' : 'false',
        onClick: () => onTabChange && onTabChange('popular'),
      }, '인기순', createElement('span', { class: 'tab-badge' }, String(popularPosts.length))),
      createElement('button', {
        class: `feed-tabs__button${activeTab === 'mine' ? ' feed-tabs__button--active' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': activeTab === 'mine' ? 'true' : 'false',
        onClick: () => onTabChange && onTabChange('mine'),
      }, '내 게시물', createElement('span', { class: 'tab-badge' }, String(myPosts.length)))
    ),
    createElement('div', {
      class: isMineTab ? 'feed-panel feed-panel--mine' : 'feed-panel feed-panel--live',
      'data-key': isMineTab ? 'mine-panel' : isPopularTab ? 'popular-panel' : 'live-panel',
    },
      visiblePosts.length === 0
        ? createElement('div', {
            class: 'feed-empty',
            'data-key': isMineTab ? 'mine-empty' : isPopularTab ? 'popular-empty' : 'live-empty',
          },
            createElement('div', { class: 'feed-empty__icon' }),
            createElement('p', { class: 'feed-empty__title' }, emptyTitle),
            createElement('p', { class: 'feed-empty__sub' }, emptySub)
          )
        : createElement('div', {
            class: 'feed-grid',
            'data-key': isMineTab ? 'mine-grid' : isPopularTab ? 'popular-grid' : 'live-grid',
          },
          ...visiblePosts.map((post, i) =>
            PostCard({
              post,
              ttl: postTtls[post.id] ?? post.ttl,
              liking: Boolean(likingPosts[post.id]),
              hasLiked: post.likedBy ? post.likedBy.includes(username) : false,
              isArchiveView: isMineTab,
              rank: isPopularTab ? i + 1 : null,
              onLike,
            })
          )
        )
    )
  );
}
