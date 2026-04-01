const { v4: uuidv4 } = require('uuid');

const USERS = [
  { id: '민수', seed: 'minsu' },
  { id: '철수', seed: 'chulsu' },
  { id: '영희', seed: 'younghee' },
  { id: '은숙', seed: 'eunsuk' },
  { id: '민영', seed: 'minyoung' },
  { id: '현상', seed: 'hyunsang' },
  { id: '상훈', seed: 'sanghun' },
  { id: '주영', seed: 'juyoung' },
  { id: '영심', seed: 'youngsim' },
  { id: '수찬', seed: 'suchan' },
];

const POST_TEXTS = [
  '햇살이 좋아서 산책하다가 한 컷.',
  '오늘 점심은 깔끔하게 비빔밥!',
  '카페 창가 자리는 늘 옳다.',
  '퇴근길 하늘이 너무 예뻐서 저장.',
  '조용한 음악과 함께하는 저녁.',
  '책 한 권 끝내고 뿌듯한 밤.',
  '새 운동화 신고 첫 러닝 완료.',
  '비 오는 날엔 따뜻한 국물이 최고.',
  '주말 브런치 성공, 기분도 성공.',
  '작은 변화가 하루를 바꾼다.',
  '오늘의 목표 달성 체크!',
  '친구랑 수다 떨다 시간 순삭.',
  '노을 색감이 영화 같던 순간.',
  '집중 잘 되는 플레이리스트 발견.',
  '오랜만에 만난 동네 골목 풍경.',
  '달달한 디저트로 당 충전 완료.',
  '한 장으로 남겨두는 오늘의 기분.',
  '아침 공기가 상쾌해서 좋았다.',
  '작업하다가 잠깐 머리 식히는 중.',
  '저녁 산책 코스 업데이트.',
  '사진 정리하다 추억 여행 중.',
  '가볍게 스트레칭하고 하루 시작.',
  '다음 여행지는 어디로 갈까.',
  '따뜻한 라떼와 함께한 오전.',
  '오늘은 유난히 바람이 시원하다.',
  '맛집 도장 깨기 1승 추가.',
  '창밖 풍경 보며 잠깐 멍 타임.',
  '할 일 끝내고 얻은 자유 시간.',
  '운동 끝나고 마시는 물이 제일 맛있다.',
  '좋은 문장 하나가 큰 힘이 된다.',
  '저녁 노을 아래 걷는 길.',
  '집밥 한 끼로 채우는 안정감.',
  '바쁜 날일수록 천천히 숨 고르기.',
  '오랜만에 듣는 노래가 반갑다.',
  '정리된 책상에서 시작하는 집중.',
  '따뜻한 조명 아래서 읽는 시간.',
  '작은 성취를 기록하는 습관.',
  '새로운 취미를 시작해본 날.',
  '계절 바뀌는 냄새가 느껴진다.',
  '오늘도 무사히, 잘 살아냈다.',
  '한적한 거리에서 찾은 평온.',
  '달빛이 밝아서 괜히 기분 좋다.',
  '맛있는 저녁으로 하루 마무리.',
  '기다리던 주말이 드디어 왔다.',
  '낯선 길에서 만난 익숙한 온기.',
  '핸드드립 향이 퍼지는 아침.',
  '클라우드 같은 구름, 계속 보게 된다.',
  '비 온 뒤 공기가 맑아졌다.',
  '메모장 가득 채운 아이디어들.',
  '오늘의 하이라이트를 여기 남긴다.',
];

const SEED_LIKES = [
   87, 143,  12,  55,  99,  // 민수
   34,  76, 120,   8,  61,  // 철수
  143,   3,  47,  92,  28,  // 영희
  110,  65,  19,  83, 137,  // 은숙
    5,  44, 101,  72,  56,  // 민영
  128,  17,  88,   2, 115,  // 현상
   39,  94,  23, 143,  67,  // 상훈
   11,  79, 132,  50, 105,  // 주영
  141,   6,  58,  96,  31,  // 영심
  119,  42,  85,  14, 143,  // 수찬
];

function makeProfileImage(seed) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}-profile/200/200`;
}

function makePostImage(seed, postIndex) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}-post-${postIndex}/1080/1080`;
}

function makeTtlBuckets() {
  const buckets = [
    ...Array(30).fill(300),
    ...Array(10).fill(120),
    ...Array(10).fill(60),
  ];

  for (let i = buckets.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [buckets[i], buckets[j]] = [buckets[j], buckets[i]];
  }

  return buckets;
}

function seedData(users, livePosts, archivedPosts, userProfiles) {
  users.clear();
  livePosts.clear();
  archivedPosts.clear();
  userProfiles.clear();

  for (const user of USERS) {
    users.add(user.id);
    userProfiles.set(user.id, { profileImage: makeProfileImage(user.seed) });
    archivedPosts.set(user.id, new Map());
  }

  const ttls = makeTtlBuckets();
  const now = Date.now();
  let postOrder = 0;

  for (const user of USERS) {
    for (let postIndex = 1; postIndex <= 5; postIndex += 1) {
      const baseTtl = ttls[postOrder];
      const likes = SEED_LIKES[postOrder];
      const ttl = baseTtl;
      const createdAt = now - postOrder * 1000;
      const post = {
        id: uuidv4(),
        author: user.id,
        text: POST_TEXTS[postOrder],
        imageData: makePostImage(user.seed, postIndex),
        likes,
        likedBy: new Set(),
        ttl,
        lastSync: now,
        createdAt,
        isExpired: false,
        expiredAt: null,
      };

      livePosts.set(post.id, post);
      archivedPosts.get(user.id).set(post.id, {
        ...post,
        likedBy: new Set(post.likedBy),
      });

      postOrder += 1;
    }
  }
}

module.exports = {
  seedData,
  makeProfileImage,
};
