# Flicker

작은 SNS를 직접 만든 미니 React 스타일 프레임워크 위에서 구현한 학습용 프로젝트입니다.
로그인, 피드 조회, 글 작성, 좋아요, TTL(Time To Live) 카운트다운을 통해 `useState`, `useEffect`, `useMemo`, `props`, 마운트/렌더링 개념을 한 번에 익히도록 구성되어 있습니다.

## 한눈에 보기

- 프론트엔드: 직접 구현한 함수형 컴포넌트 + 훅 기반 렌더링
- 백엔드: `Express` 기반 인메모리 API 서버
- 주요 기능:
  - 닉네임 로그인
  - 실시간 피드 조회
  - 내 게시물 보기
  - 인기순 정렬
  - 게시물 TTL 10초 카운트다운
  - 좋아요 시 TTL 3초 연장
  - 이미지 포함 게시글 작성

## 이 프로젝트가 학습에 좋은 이유

이 프로젝트는 일반 React 앱을 사용하는 데서 끝나지 않고, `src/framework` 안에 훅과 렌더링 로직을 직접 구현해 두었습니다.
그래서 "상태가 왜 유지되는지", "effect가 왜 렌더 후 실행되는지", "memo가 왜 필요한지"를 코드로 따라가며 이해하기 좋습니다.

특히 다음 질문에 답하기 좋은 구조입니다.

- `useState`는 값을 어디에 저장하는가
- `setState`가 호출되면 왜 다시 렌더되는가
- `useEffect`는 왜 렌더 후 실행되는가
- `useMemo`는 어떤 계산을 아껴주는가
- 부모가 가진 상태가 `props`로 자식에게 어떻게 전달되는가

## 실행 방법

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
npm run dev
```

또는 일반 실행:

```bash
npm start
```

실행 후 브라우저에서 아래 주소로 접속합니다.

- [http://localhost:3000](http://localhost:3000)

## 폴더 구조

```text
5week-react/
├── public/
│   ├── index.html
│   └── styles/
├── server/
│   ├── index.js
│   └── seed.js
├── src/
│   ├── components/
│   │   ├── App.js
│   │   ├── Login.js
│   │   ├── Feed.js
│   │   ├── CreatePost.js
│   │   ├── Header.js
│   │   └── PostCard.js
│   ├── framework/
│   │   ├── component.js
│   │   ├── hooks.js
│   │   ├── router.js
│   │   ├── tracer.js
│   │   └── vdom.js
│   ├── services/
│   │   └── api.js
│   ├── test/
│   └── main.js
├── package.json
└── README.md
```

## 전체 흐름

```mermaid
flowchart TD
  A["브라우저에서 App 마운트"] --> B["App이 state 생성"]
  B --> C["현재 route에 맞는 화면 렌더"]
  C --> D["렌더 후 useEffect 실행"]
  D --> E["API 요청 / 타이머 등록 / 외부 작업"]
  E --> F["setState 호출"]
  F --> G["상태 변경"]
  G --> C
```

핵심은 단순합니다.

- `useState`는 값을 기억합니다.
- `useEffect`는 렌더 후 해야 할 일을 실행합니다.
- `useMemo`는 계산 결과를 기억합니다.
- `props`는 부모가 자식에게 넘겨주는 값입니다.

## 핵심 컴포넌트 설명

### `App`

루트 컴포넌트입니다. 이 프로젝트의 대부분 상태가 여기에 모여 있습니다.

역할:

- 로그인 상태 관리
- 피드 데이터 관리
- 글 작성 상태 관리
- 라우트에 맞는 화면 선택
- 자식 컴포넌트에 `props` 전달

즉, `App`은 "상태 관리자", 나머지 컴포넌트는 "받아서 그리는 화면"에 가깝습니다.

### `Login`

로그인 화면을 그리는 순수 함수 컴포넌트입니다.
자기 상태를 직접 가지지 않고, `username`, `error`, `loading`, `onInput`, `onSubmit`을 `props`로 받아 렌더링합니다.

### `Feed`

실시간 피드, 인기순 피드, 내 게시물 탭을 보여주는 컴포넌트입니다.
현재 탭, 게시글 목록, TTL, 좋아요 진행 상태를 전부 `props`로 받아 화면만 구성합니다.

### `CreatePost`

텍스트/이미지 게시글 작성 화면입니다.
입력값과 로딩 상태, 에러 메시지를 직접 소유하지 않고 부모에게서 받습니다.

## 훅 개념 정리

### 훅(Hook)이란?

함수 컴포넌트 안에서 React 스타일 기능을 사용할 수 있게 해주는 `use...` 형태의 함수입니다.

이 프로젝트에서는 다음 훅을 직접 구현했습니다.

- `useState`
- `useEffect`
- `useMemo`

정리하면:

- `state`는 개념 이름입니다.
- `effect`도 개념 이름입니다.
- `useState`, `useEffect`, `useMemo`는 훅입니다.

## `useState`

`useState`는 컴포넌트가 기억해야 할 값을 저장하는 훅입니다.

형태:

```js
const [value, setValue] = useState(initialValue);
```

의미:

- `value`: 현재 상태값
- `setValue`: 상태를 바꾸는 함수

이 프로젝트에서 `useState`는 주로 `App`에서 사용됩니다.

예시:

- `loginUsername`: 로그인 입력값
- `loginLoading`: 로그인 요청 중인지 여부
- `livePosts`: 실시간 피드 목록
- `activeTab`: 현재 선택된 탭
- `postTtls`: 게시물별 남은 시간
- `createText`: 작성 중인 게시글 텍스트

흐름:

```mermaid
flowchart LR
  A["초기 렌더"] --> B["useState로 상태 생성"]
  B --> C["상태값으로 화면 그림"]
  C --> D["사용자 입력/클릭"]
  D --> E["setState 호출"]
  E --> F["상태 변경"]
  F --> G["다시 렌더"]
  G --> C
```

## `useEffect`

`useEffect`는 렌더가 끝난 뒤 실행할 작업을 등록하는 훅입니다.

주로 이런 작업에 사용합니다.

- 서버에서 데이터 가져오기
- 타이머 등록하기
- 이벤트 리스너 붙이기
- 정리 작업(cleanup) 하기

형태:

```js
useEffect(() => {
  // 실행할 작업
  return () => {
    // 정리 작업
  };
}, [deps]);
```

이 프로젝트에서 사용되는 대표 사례:

- 로그인 상태 확인
- 피드 초기 로드
- 3초마다 피드 폴링
- 1초마다 TTL 카운트다운

핵심 흐름:

```mermaid
flowchart LR
  A["렌더"] --> B["화면 표시"]
  B --> C["useEffect 실행"]
  C --> D["API 요청 / 타이머 등록"]
  D --> E["setState"]
  E --> F["재렌더"]
```

## `useMemo`

`useMemo`는 계산 결과를 기억해두고, 의존값이 바뀔 때만 다시 계산하는 훅입니다.

형태:

```js
const memoizedValue = useMemo(() => {
  return expensiveCalculation();
}, [deps]);
```

이 프로젝트에서는 `livePosts`를 좋아요 많은 순으로 정렬한 `popularPosts` 계산에 사용합니다.

목적:

- 매 렌더마다 정렬하지 않기
- `livePosts`가 바뀔 때만 다시 계산하기

흐름:

```mermaid
flowchart TD
  A["렌더"] --> B{"livePosts 변경?"}
  B -->|예| C["popularPosts 다시 계산"]
  B -->|아니오| D["기존 계산 결과 재사용"]
```

## `props`

`props`는 부모 컴포넌트가 자식 컴포넌트에게 전달하는 값입니다.

쉽게 말하면 컴포넌트의 입력값입니다.

예를 들어 `App`은 상태를 가지고 있고, `Login`은 그 값을 `props`로 받습니다.

```mermaid
flowchart LR
  A["App의 state"] --> B["props 전달"]
  B --> C["Login / Feed / CreatePost가 사용"]
```

`props`로는 다음을 전달할 수 있습니다.

- 문자열
- 숫자
- 배열
- 객체
- 함수

이 프로젝트에서는 데이터뿐 아니라 이벤트 핸들러 함수도 `props`로 전달합니다.

예시:

- `username`
- `loading`
- `error`
- `onInput`
- `onSubmit`
- `onLike`

## 마운트, 렌더링, 업데이트, 언마운트

### 마운트(Mount)

컴포넌트가 처음 화면에 나타나는 순간입니다.

### 렌더링(Render)

컴포넌트를 실행해서 어떤 화면을 보여줄지 계산하는 과정입니다.

### 업데이트(Update)

이미 화면에 있는 컴포넌트가 상태나 `props` 변화로 다시 렌더되는 것입니다.

### 언마운트(Unmount)

컴포넌트가 화면에서 사라지는 것입니다.

정리 그림:

```mermaid
flowchart LR
  A["처음 등장"] --> B["첫 렌더"]
  B --> C["마운트"]
  C --> D["state/props 변경"]
  D --> E["다시 렌더"]
  E --> F["업데이트"]
  F --> G["화면에서 제거"]
  G --> H["언마운트"]
```

중요한 점:

- 모든 마운트에는 첫 렌더가 포함됩니다.
- 하지만 모든 렌더가 마운트는 아닙니다.

## 이 프로젝트에서 상태가 움직이는 방식

```mermaid
flowchart TD
  A["App이 state 보유"] --> B["props로 자식에게 전달"]
  B --> C["사용자 입력/클릭"]
  C --> D["자식이 props로 받은 함수 호출"]
  D --> E["App의 setState 실행"]
  E --> F["App 재렌더"]
  F --> B
```

이 구조 덕분에 데이터 흐름이 한 방향으로 흘러서 이해하기 쉽습니다.

## 서버 동작 요약

`server/index.js`는 학습용 인메모리 서버입니다.

주요 기능:

- 로그인 처리
- 피드 조회
- 게시글 작성
- 좋아요 처리
- TTL 감소 및 만료 처리
- 테스트용 타이머 제어

특징:

- DB 없이 메모리에 데이터를 저장합니다.
- 서버에서 1초마다 TTL을 감소시킵니다.
- 좋아요를 누르면 게시글 TTL이 3초 늘어납니다.

## API 요약

### `POST /api/auth/login`

닉네임 로그인

### `GET /api/posts?username=...`

실시간 피드와 내 게시물 목록 조회

### `POST /api/posts`

새 게시글 작성

### `POST /api/posts/:id/like`

게시글 좋아요

## 학습 포인트 추천 순서

처음 읽을 때는 아래 순서로 보면 이해가 가장 잘 됩니다.

1. `src/main.js`
2. `src/components/App.js`
3. `src/framework/hooks.js`
4. `src/components/Login.js`
5. `src/components/Feed.js`
6. `src/components/CreatePost.js`
7. `server/index.js`

## 파일별 추천 관찰 포인트

### `src/main.js`

- `App`가 어디서 마운트되는지

### `src/components/App.js`

- 상태가 어디에 모여 있는지
- `useEffect`가 무엇을 하는지
- `useMemo`가 왜 필요한지
- 자식에게 어떤 `props`를 넘기는지

### `src/framework/hooks.js`

- `useState`가 상태를 어떻게 저장하는지
- `useEffect`가 왜 렌더 후 실행되는지
- `useMemo`가 어떻게 캐시되는지

### `server/index.js`

- 피드 데이터가 어떻게 만들어지는지
- TTL이 어떻게 감소하는지
- 좋아요가 왜 TTL을 늘리는지

## 마무리

이 프로젝트는 단순한 SNS 클론이 아니라, 프론트엔드 핵심 개념을 직접 눈으로 확인하기 위한 교육용 실습장에 가깝습니다.
특히 `App` 중심 상태 관리와 직접 구현한 훅 구조 덕분에 React의 핵심 철학을 배우기에 매우 좋은 코드베이스입니다.

다음 학습 단계로는 아래 순서를 추천합니다.

1. `App.js`에서 상태 흐름 따라가기
2. `hooks.js`에서 훅 저장 구조 이해하기
3. `server/index.js`에서 데이터 변화 확인하기
4. 직접 작은 상태 하나를 추가해 보기
