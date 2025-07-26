import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  UploadCloud, XCircle, ChevronDown, ChevronUp, Star, Filter, Edit, Save, Trash2, Plus, Search, Image as ImageIcon,
  Palette, Swords, Feather, ScrollText, LandPlot, Shield, Zap, RefreshCcw, Eye, Heart, List, Hash, Type, Skull, BookOpenText,
  EyeOff // DollarSignアイコンは削除
} from 'lucide-react'; // アイコンライブラリ

// Firebaseの設定は環境変数から取得
// Canvas環境ではグローバル変数 (__app_id, __firebase_config, __initial_auth_token) が提供されますが、
// ローカル開発環境では process.env から読み込むようにフォールバックします。
// eslint-disable-next-line no-undef
const appId = typeof __app_id !== 'undefined' ? __app_id : process.env.REACT_APP_FIREBASE_APP_ID || 'default-app-id';
// eslint-disable-next-line no-undef
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : (
  process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {}
);
// eslint-disable-next-line no-undef
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : process.env.REACT_APP_FIREBASE_AUTH_TOKEN || null;

// Firebase初期化
// firebaseConfig が空の場合は初期化しない（エラー防止）
const app = Object.keys(firebaseConfig).length > 0 ? initializeApp(firebaseConfig) : null;
const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;
const storage = app ? getStorage(app) : null;

// カードタイプと色の定義
const CARD_TYPES = ['クリーチャー', 'インスタント', 'ソーサリー', 'エンチャント', 'アーティファクト', 'プレインズウォーカー', '土地'];
const COLORS = ['白', '青', '黒', '赤', '緑', '多色', '無色'];
const RARITIES = ['コモン', 'アンコモン', 'レア', '神話レア'];

// カスタム属性のアイコンマッピング（事前に用意するアイコン）
const CUSTOM_ATTRIBUTE_ICONS = {
  '除去カード': Swords,
  '飛行持ち': Feather,
  'ドローソース': ScrollText,
  '土地加速': LandPlot,
  'カウンター': Shield,
  '火力': Zap,
  '墓地対策': RefreshCcw,
  'ライフロス': Heart,
  'トークン生成': Plus,
  'ルーティング': Search,
  '警戒': Eye,
  '接死': Skull, // 例として追加
  'トランプル': Hash, // 例として追加
  '先制攻撃': Type, // 例として追加
};

// モーダルコンポーネント
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      {/* max-w-lg を max-w-6xl に変更してモーダルを大きくする */}
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full p-6 relative transform transition-all duration-300 scale-95 opacity-0 animate-scale-in">
        <h2 className="text-2xl font-bold mb-4 text-gray-800 border-b pb-2">{title}</h2>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 transition-colors duration-200"
        >
          <XCircle size={24} />
        </button>
        <div className="max-h-[80vh] overflow-y-auto pr-2">
          {children}
        </div>
      </div>
    </div>
  );
};

// ローディングスピナー
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
  </div>
);

// メッセージボックスコンポーネント
const MessageBox = ({ message, type, onClose }) => {
  const bgColor = type === 'error' ? 'bg-red-500' : 'bg-green-500';
  const title = type === 'error' ? 'エラー' : '成功';

  return (
    <div className={`fixed bottom-4 right-4 ${bgColor} text-white p-4 rounded-lg shadow-lg z-50 flex items-center justify-between animate-fade-in-up`}>
      <div>
        <h3 className="font-bold">{title}</h3>
        <p>{message}</p>
      </div>
      <button onClick={onClose} className="ml-4 text-white hover:text-gray-200">
        <XCircle size={20} />
      </button>
    </div>
  );
};

// カードアイテムコンポーネント
const CardItem = ({ card, onEdit, onToggleBomb, onRatingChange, onManaCostChange, onToggleCustomAttribute, customAttributes, isStealthMode }) => {
  const IconComponent = card.isBomb ? Star : Star; // ボムレアのアイコンは常にStar
  const iconColorClass = card.isBomb ? 'text-yellow-400' : 'text-gray-400';

  // 265x370 の比率を維持するための padding-bottom 計算
  // height / width = 370 / 265 = 1.396226...
  const aspectRatioPadding = (370 / 265) * 100; // %

  return (
    <div className="relative bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col group">
      {/* カード画像コンテナ: w-fullで幅を確保し、padding-bottomで高さを比率に合わせて設定 */}
      <div className="relative w-full bg-gray-200 flex items-center justify-center overflow-hidden"
           style={{ paddingBottom: `${aspectRatioPadding}%` }}>
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name || 'カード画像'}
            className="absolute inset-0 w-full h-full object-cover" // 画像をコンテナいっぱいに表示
            onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/265x370/cccccc/333333?text=No+Image`; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon size={48} className="text-gray-400" />
          </div>
        )}
        {/* ボムレアアイコン */}
        {!isStealthMode && (
          <button
            onClick={() => onToggleBomb(card.id)}
            className={`absolute top-2 right-2 p-1 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-colors duration-200 ${iconColorClass}`}
            aria-label={card.isBomb ? "ボムレア解除" : "ボムレアに設定"}
          >
            <IconComponent size={20} fill={card.isBomb ? 'currentColor' : 'none'} />
          </button>
        )}
        {/* カスタム属性オーバーレイ */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {card.customAttributeIds && card.customAttributeIds.map(attrId => {
            const attr = customAttributes.find(ca => ca.id === attrId);
            if (!attr) return null;
            const CustomIcon = CUSTOM_ATTRIBUTE_ICONS[attr.name] || Plus; // デフォルトアイコン
            return (
              <span key={attr.id} className="bg-blue-600 bg-opacity-75 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                <CustomIcon size={12} />
                {attr.name}
              </span>
            );
          })}
        </div>
      </div>

      {/* カード情報と評価 */}
      <div className="p-4 flex flex-col flex-grow">
        {/* カード名、色、レアリティ、タイプは常に非表示 */}
        {/* <h3 className="text-lg font-semibold text-gray-800 truncate mb-1" title={card.name || 'カード名未設定'}>
          {card.name || 'カード名未設定'}
        </h3>
        <p className="text-sm text-gray-600 mb-2">
          {card.color} | {card.rarity} | {card.type}
        </p> */}

        {!isStealthMode && (
          <>
            <div className="flex items-center mt-auto mb-2">
              <label htmlFor={`rating-${card.id}`} className="text-gray-700 mr-2">評価:</label>
              <input
                id={`rating-${card.id}`}
                type="number"
                step="0.1"
                min="0.0"
                max="5.0"
                value={card.rating !== undefined ? card.rating : ''}
                onChange={(e) => onRatingChange(card.id, parseFloat(e.target.value))}
                className="w-20 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-center text-gray-800"
                placeholder="0.0-5.0"
              />
              <button
                onClick={() => onEdit(card)}
                className="ml-auto p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors duration-200 flex items-center justify-center"
                aria-label="カードを編集"
              >
                <Edit size={18} />
              </button>
            </div>
            {/* マナコスト入力欄を追加 */}
            <div className="flex items-center mb-2">
              <label htmlFor={`mana-cost-${card.id}`} className="text-gray-700 mr-2">
                コスト: {/* DollarSignアイコンを削除 */}
              </label>
              <input
                id={`mana-cost-${card.id}`}
                type="number"
                min="0"
                value={card.manaCost !== undefined ? card.manaCost : ''}
                onChange={(e) => onManaCostChange(card.id, parseInt(e.target.value))}
                className="w-20 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-center text-gray-800"
                placeholder="0+"
              />
            </div>
          </>
        )}

        {/* カスタム属性トグルを評価の下に表示 */}
        {!isStealthMode && customAttributes.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 border-t pt-2 border-gray-100">
            {customAttributes.map(attr => {
              const isSelected = card.customAttributeIds && card.customAttributeIds.includes(attr.id);
              const CustomIcon = CUSTOM_ATTRIBUTE_ICONS[attr.name] || Plus;
              return (
                <button
                  key={attr.id}
                  onClick={() => onToggleCustomAttribute(card.id, attr.id)}
                  className={`px-2 py-1 rounded-full text-xs flex items-center gap-1 transition-colors duration-200
                              ${isSelected ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  <CustomIcon size={12} />
                  {attr.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};


function App() {
  const [dbInstance, setDbInstance] = useState(null);
  const [authInstance, setAuthInstance] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [customAttributes, setCustomAttributes] = useState([]);
  const [sets, setSets] = useState([]); // 新しいstate: セットのリスト
  const [currentSetId, setCurrentSetId] = useState(null); // 新しいstate: 現在選択中のセットID
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [isCustomAttrModalOpen, setIsCustomAttrModalOpen] = useState(false);
  const [isRarityModalOpen, setIsRarityModalOpen] = useState(false);
  const [isTypeAssignmentModalOpen, setIsTypeAssignmentModalOpen] = useState(false); // 新しいstate: タイプ一括設定モーダル
  const [isSetManagementModalOpen, setIsSetManagementModalOpen] = useState(false); // 新しいstate: セット管理モーダルの開閉
  const [isStealthMode, setIsStealthMode] = useState(false); // 新しいstate: 非表示モード

  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState('success');

  // フィルターステート
  const [filters, setFilters] = useState({
    colors: [],
    rarities: [],
    types: [],
    isBomb: false,
    customAttributeIds: [],
    searchTerm: '',
  });

  // ソートステート
  const [sortBy, setSortBy] = useState('rating-desc'); // 'rating-desc', 'rating-asc', 'name-asc', 'name-desc', 'manaCost-asc', 'manaCost-desc'
  const [displayMode, setDisplayMode] = useState('grid'); // 'grid', 'tier'

  // メッセージ表示関数
  const showMessage = useCallback((msg, type = 'success') => {
    setMessage(msg);
    setMessageType(type);
    const timer = setTimeout(() => {
      setMessage(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Firebase初期化と認証
  useEffect(() => {
    const initializeFirebase = async () => {
      // Firebaseインスタンスが未定義の場合はエラーメッセージを表示して終了
      if (!app || !db || !auth || !storage) {
        console.error("Firebase is not initialized. Check your firebaseConfig or environment variables.");
        showMessage("Firebaseの初期化に失敗しました。設定を確認してください。", "error");
        setLoading(false);
        return;
      }

      try {
        setAuthInstance(auth);
        setDbInstance(db);

        // 認証状態の監視
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
          if (user) {
            setUserId(user.uid);
            console.log("Firebase authenticated. User ID:", user.uid);
          } else {
            // 匿名認証
            const anonymousUser = await signInAnonymously(auth);
            setUserId(anonymousUser.user.uid);
            console.log("Signed in anonymously. User ID:", anonymousUser.user.uid);
          }
          setLoading(false);
        });

        // カスタムトークンがあればサインイン
        if (initialAuthToken) {
          try {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log("Signed in with custom token.");
          } catch (error) {
            console.error("Error signing in with custom token:", error);
            showMessage("認証に失敗しました。", "error");
            // カスタムトークンで失敗した場合、匿名認証を試みる
            await signInAnonymously(auth);
          }
        } else {
          // カスタムトークンがない場合、匿名認証
          await signInAnonymously(auth);
        }

        return () => unsubscribe();
      } catch (error) {
        console.error("Firebase initialization error:", error);
        showMessage("Firebaseの初期化に失敗しました。", "error");
        setLoading(false);
      }
    };

    initializeFirebase();
  }, [initialAuthToken, showMessage]);

  // Firestoreからのデータ取得 (カード、カスタム属性、セット)
  useEffect(() => {
    if (!dbInstance || !userId) return;

    // カードデータのリアルタイムリスナー
    const cardsCollectionRef = collection(dbInstance, `artifacts/${appId}/users/${userId}/cards`);
    const unsubscribeCards = onSnapshot(cardsCollectionRef, (snapshot) => {
      const fetchedCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCards(fetchedCards);
      console.log("Cards fetched:", fetchedCards.length);
    }, (error) => {
      console.error("Error fetching cards:", error);
      showMessage("カードデータの取得に失敗しました。", "error");
    });

    // カスタム属性のリアルタイムリスナー
    const customAttrsCollectionRef = collection(dbInstance, `artifacts/${appId}/users/${userId}/customAttributes`);
    const unsubscribeCustomAttrs = onSnapshot(customAttrsCollectionRef, (snapshot) => {
      const fetchedAttrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomAttributes(fetchedAttrs);
      console.log("Custom attributes fetched:", fetchedAttrs.length);
    }, (error) => {
      console.error("Error fetching custom attributes:", error);
      showMessage("カスタム属性の取得に失敗しました。", "error");
    });

    // セットデータのリアルタイムリスナー
    const setsCollectionRef = collection(dbInstance, `artifacts/${appId}/users/${userId}/sets`);
    const unsubscribeSets = onSnapshot(setsCollectionRef, (snapshot) => {
      const fetchedSets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSets(fetchedSets);
      // セットがロードされたら、まだ何も選択されていなければ最初のセットを選択する
      // または、現在選択中のセットが削除された場合も最初のセットを選択する
      if (fetchedSets.length > 0 && (!currentSetId || !fetchedSets.some(s => s.id === currentSetId))) {
        setCurrentSetId(fetchedSets[0].id);
      } else if (fetchedSets.length === 0) {
        setCurrentSetId(null); // セットがない場合は選択を解除
      }
      console.log("Sets fetched:", fetchedSets.length);
    }, (error) => {
      console.error("Error fetching sets:", error);
      showMessage("セットデータの取得に失敗しました。", "error");
    });

    return () => {
      unsubscribeCards();
      unsubscribeCustomAttrs();
      unsubscribeSets(); // セットのリスナーもクリーンアップ
    };
  }, [dbInstance, userId, currentSetId, showMessage]); // currentSetIdを依存配列に追加

  // カードアップロード処理
  const handleUploadCards = async (files, color, setId) => {
    if (!userId || !storage || !db) {
      showMessage("Firebaseサービスが利用できません。認証または初期化を確認してください。", "error");
      return;
    }
    if (!setId) { // セットが選択されていない場合はエラー
      showMessage("カードをアップロードするセットを選択してください。", "error");
      setIsUploadModalOpen(true); // モーダルを再度開いて選択を促す
      return;
    }

    setLoading(true);
    const uploadedCardData = [];
    for (const file of files) {
      try {
        const storageRef = ref(storage, `card_images/${userId}/${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);

        const newCard = {
          name: file.name.split('.')[0], // ファイル名をカード名とする
          color: color,
          rarity: '', // 初期値は空
          type: '', // 初期値は空
          rating: 0.0,
          manaCost: null, // マナコストの初期値
          isBomb: false,
          customAttributeIds: [],
          imageUrl: imageUrl,
          comment: '',
          setId: setId, // セットIDを保存
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/cards`), newCard);
        uploadedCardData.push({ id: docRef.id, ...newCard });
      } catch (error) {
        console.error("Error uploading card:", file.name, error);
        showMessage(`カード ${file.name} のアップロードに失敗しました。`, "error");
      }
    }
    setLoading(false);
    setIsUploadModalOpen(false);
    showMessage("カードをアップロードしました！");
  };

  // カード情報更新処理
  const handleUpdateCard = async (cardId, updatedFields) => {
    if (!userId || !db) return;
    try {
      const cardRef = doc(db, `artifacts/${appId}/users/${userId}/cards`, cardId);
      await updateDoc(cardRef, { ...updatedFields, updatedAt: new Date() });
      showMessage("カード情報を更新しました。");
    } catch (error) {
      console.error("Error updating card:", error);
      showMessage("カード情報の更新に失敗しました。", "error");
    }
  };

  // カード削除処理
  const handleDeleteCard = async (cardId, imageUrl) => {
    if (!userId || !db || !storage) return;
    // 確認ダイアログの代替
    const userConfirmed = window.confirm('本当にこのカードを削除しますか？');
    if (!userConfirmed) return;

    setLoading(true);
    try {
      // Storageから画像を削除
      if (imageUrl) {
        // imageUrlが完全なURLの場合、パスを抽出する必要がある
        const url = new URL(imageUrl);
        const path = decodeURIComponent(url.pathname); // URLエンコードされたパスをデコード
        // /o/ 以降のパスを取得し、最初のスラッシュを削除
        const imagePath = path.startsWith('/o/') ? path.substring(3) : path;
        const storageRef = ref(storage, imagePath);
        await deleteObject(storageRef);
      }
      // Firestoreからドキュメントを削除
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, cardId));
      showMessage("カードを削除しました。");
    } catch (error) {
            console.error("Error deleting card:", error);
            showMessage("カードの削除に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  };

  // ボムレア切り替え
  const handleToggleBomb = (cardId) => {
    const cardToUpdate = cards.find(card => card.id === cardId);
    if (cardToUpdate) {
      handleUpdateCard(cardId, { isBomb: !cardToUpdate.isBomb });
    }
  };

  // 評価変更
  const handleRatingChange = (cardId, newRating) => {
    // 0.0から5.0の範囲に制限し、小数点第一位までにする
    const clampedRating = Math.max(0.0, Math.min(5.0, newRating));
    const roundedRating = Math.round(clampedRating * 10) / 10;
    handleUpdateCard(cardId, { rating: roundedRating });
  };

  // マナコスト変更
  const handleManaCostChange = (cardId, newManaCost) => {
    // 0以上の整数に制限
    const parsedCost = parseInt(newManaCost);
    const validatedCost = isNaN(parsedCost) || parsedCost < 0 ? null : parsedCost; // 無効な場合はnull
    handleUpdateCard(cardId, { manaCost: validatedCost });
  };

  // カスタム属性の追加
  const handleAddCustomAttribute = async (name) => {
    if (!userId || !name.trim() || !db) return;
    try {
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/customAttributes`), { name: name.trim() });
      showMessage("カスタム属性を追加しました。");
    } catch (error) {
      console.error("Error adding custom attribute:", error);
      showMessage("カスタム属性の追加に失敗しました。", "error");
    }
  };

  // カスタム属性の削除
  const handleDeleteCustomAttribute = async (attrId) => {
    if (!userId || !db) return;
    const userConfirmed = window.confirm('このカスタム属性を削除しますか？この属性が割り当てられているカードからも削除されます。');
    if (!userConfirmed) return;
    try {
      // 属性が割り当てられているカードから削除
      const cardsToUpdate = cards.filter(card => card.customAttributeIds && card.customAttributeIds.includes(attrId));
      for (const card of cardsToUpdate) {
        await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, card.id), {
          customAttributeIds: card.customAttributeIds.filter(id => id !== attrId)
        });
      }
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/customAttributes`, attrId));
      showMessage("カスタム属性を削除しました。");
    } catch (error) {
      console.error("Error deleting custom attribute:", error);
      showMessage("カスタム属性の削除に失敗しました。", "error");
    }
  };

  // カードのカスタム属性をトグルする
  const handleToggleCustomAttribute = async (cardId, attributeId) => {
    if (!userId || !db) return;
    const cardToUpdate = cards.find(card => card.id === cardId);
    if (!cardToUpdate) return;

    const currentAttributes = cardToUpdate.customAttributeIds || [];
    let newAttributes;

    if (currentAttributes.includes(attributeId)) {
      newAttributes = currentAttributes.filter(id => id !== attributeId);
    } else {
      newAttributes = [...currentAttributes, attributeId];
    }

    try {
      await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, cardId), {
        customAttributeIds: newAttributes,
        updatedAt: new Date(),
      });
      showMessage("カスタム属性を更新しました。");
    } catch (error) {
      console.error("Error toggling custom attribute:", error);
      showMessage("カスタム属性の更新に失敗しました。", "error");
    }
  };

  // セットの追加
  const handleAddSet = async (name) => {
    if (!userId || !name.trim() || !db) return;
    try {
      const newSetRef = await addDoc(collection(db, `artifacts/${appId}/users/${userId}/sets`), { name: name.trim(), createdAt: new Date() });
      showMessage(`セット「${name}」を追加しました。`);
      // 新しく追加したセットを自動的に選択する
      setCurrentSetId(newSetRef.id);
    } catch (error) {
      console.error("Error adding set:", error);
      showMessage("セットの追加に失敗しました。", "error");
    }
  };

  // セットの削除
  const handleDeleteSet = async (setId) => {
    if (!userId || !db) return;
    const userConfirmed = window.confirm('このセットを削除しますか？このセットに紐づくカードもすべて削除されます。');
    if (!userConfirmed) return;

    setLoading(true);
    try {
      // 該当セットに紐づくカードをすべて取得し、削除
      // Firestoreのwhere句は等価比較のみサポートされるため、orderByは使わない
      const cardsInSetQuery = query(collection(db, `artifacts/${appId}/users/${userId}/cards`), where("setId", "==", setId));
      const querySnapshot = await getDocs(cardsInSetQuery);
      const deleteCardPromises = querySnapshot.docs.map(async (cardDoc) => {
        const cardData = cardDoc.data();
        if (cardData.imageUrl && storage) {
          try {
            // imageUrlからStorageパスを正確に抽出
            const url = new URL(cardData.imageUrl);
            const path = decodeURIComponent(url.pathname); // URLエンコードされたパスをデコード
            // /o/ 以降のパスを取得し、最初のスラッシュを削除
            const imagePath = path.startsWith('/o/') ? path.substring(3) : path;
            const storageRef = ref(storage, imagePath);
            await deleteObject(storageRef);
          } catch (storageError) {
            console.warn(`Warning: Could not delete image for card ${cardDoc.id} from Storage:`, storageError);
            // 画像削除失敗は致命的ではないので、続行
          }
        }
        return deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, cardDoc.id));
      });
      await Promise.all(deleteCardPromises);

      // セット自体を削除
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/sets`, setId));
      showMessage("セットと関連カードを削除しました。");

      // 削除したセットが現在選択中のセットだった場合、選択を解除または最初のセットを選択
      if (currentSetId === setId) {
        setCurrentSetId(sets.length > 1 ? sets.find(s => s.id !== setId)?.id : null);
      }

    } catch (error) {
      console.error("Error deleting set:", error);
      showMessage("セットの削除に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  };


  // フィルタリングされたカードの取得
  const getFilteredCards = useCallback(() => {
    return cards.filter(card => {
      // 現在選択中のセットでフィルタリング
      if (currentSetId && card.setId !== currentSetId) return false;

      // 色フィルター
      if (filters.colors.length > 0 && !filters.colors.includes(card.color)) return false;
      // レアリティフィルター
      if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
      // カードタイプフィルター
      if (filters.types.length > 0 && !filters.types.includes(card.type)) return false;
      // ボムレアフィルター
      if (filters.isBomb && !card.isBomb) return false;
      // カスタム属性フィルター
      if (filters.customAttributeIds.length > 0) {
        if (!card.customAttributeIds || !filters.customAttributeIds.every(id => card.customAttributeIds.includes(id))) {
          return false;
        }
      }
      // 検索語フィルター（カード名またはコメント）
      if (filters.searchTerm) {
        const lowerCaseSearchTerm = filters.searchTerm.toLowerCase();
        const cardNameMatch = card.name && card.name.toLowerCase().includes(lowerCaseSearchTerm);
        const commentMatch = card.comment && card.comment.toLowerCase().includes(lowerCaseSearchTerm);
        if (!cardNameMatch && !commentMatch) return false;
      }
      return true;
    });
  }, [cards, filters, currentSetId]); // currentSetIdを依存配列に追加

  // ソートされたカードの取得
  const getSortedCards = useCallback((filteredCards) => {
    const sorted = [...filteredCards].sort((a, b) => {
      if (sortBy === 'rating-desc') {
        return (b.rating || 0) - (a.rating || 0);
      } else if (sortBy === 'rating-asc') {
        return (a.rating || 0) - (b.rating || 0);
      } else if (sortBy === 'manaCost-asc') {
        // null (未設定) は最後に
        if (a.manaCost === null && b.manaCost === null) return 0;
        if (a.manaCost === null) return 1;
        if (b.manaCost === null) return -1;
        return (a.manaCost || 0) - (b.manaCost || 0);
      } else if (sortBy === 'manaCost-desc') {
        // null (未設定) は最後に
        if (a.manaCost === null && b.manaCost === null) return 0;
        if (a.manaCost === null) return 1;
        if (b.manaCost === null) return -1;
        return (b.manaCost || 0) - (a.manaCost || 0);
      } else if (sortBy === 'name-asc') {
        return (a.name || '').localeCompare(b.name || '');
      } else if (sortBy === 'name-desc') {
        return (b.name || '').localeCompare(a.name || '');
      }
      return 0;
    });
    return sorted;
  }, [sortBy]);

  const filteredAndSortedCards = getSortedCards(getFilteredCards());

  // Tierリスト表示用のグループ化
  const getTieredCards = useCallback(() => {
    const tiers = {
      '5': [], '4': [], '3': [], '2': [], '1': [], '0': []
    };
    filteredAndSortedCards.forEach(card => {
      const tierKey = Math.floor(card.rating || 0).toString();
      if (tiers[tierKey]) {
        tiers[tierKey].push(card);
      } else {
        tiers['0'].push(card); // 0未満の評価は0にまとめる
      }
    });

    // 各Tier内で評価順にソート
    Object.keys(tiers).forEach(tierKey => {
      tiers[tierKey].sort((a, b) => (a.rating || 0) - (b.rating || 0));
    });

    return tiers;
  }, [filteredAndSortedCards]);

  const tieredCards = getTieredCards();

  // カードアップロードモーダル
  const CardUploadModal = ({ isOpen, onClose, onUpload, sets, currentSetId }) => {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [selectedColor, setSelectedColor] = useState(COLORS[0]);
    const [uploadSetId, setUploadSetId] = useState(currentSetId || ''); // モーダル内のセット選択状態
    const fileInputRef = useRef(null);

    // 現在のセットIDが変更されたら、モーダル内の選択も更新
    useEffect(() => {
      if (currentSetId && currentSetId !== uploadSetId) {
        setUploadSetId(currentSetId);
      }
    }, [currentSetId, uploadSetId]);

    const handleFileChange = (e) => {
      setSelectedFiles(Array.from(e.target.files));
    };

    const handleSubmit = () => {
      if (selectedFiles.length === 0) {
        showMessage("ファイルを1つ以上選択してください。", "error");
        return;
      }
      if (!uploadSetId) {
        showMessage("カードをアップロードするセットを選択してください。", "error");
        return;
      }
      onUpload(selectedFiles, selectedColor, uploadSetId); // setIdを渡す
      setSelectedFiles([]);
      setSelectedColor(COLORS[0]);
      // uploadSetIdは現在のセットIDにリセットしない (ユーザーが明示的に変更した可能性を考慮)
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カード画像をアップロード">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="card-color">
            カードの色 (一括適用)
          </label>
          <select
            id="card-color"
            value={selectedColor}
            onChange={(e) => setSelectedColor(e.target.value)}
            className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
            {COLORS.map(color => (
              <option key={color} value={color}>{color}</option>
            ))}
          </select>
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="upload-set">
            アップロード先のセット
          </label>
          <select
            id="upload-set"
            value={uploadSetId}
            onChange={(e) => setUploadSetId(e.target.value)}
            className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          >
            <option value="">セットを選択してください</option>
            {sets.map(set => (
              <option key={set.id} value={set.id}>{set.name}</option>
            ))}
          </select>
          {sets.length === 0 && (
            <p className="text-red-500 text-sm mt-1">
              セットがありません。先に「セットを管理」からセットを追加してください。
            </p>
          )}
        </div>
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="card-images">
            カード画像ファイルを選択 (複数選択可)
          </label>
          <input
            type="file"
            id="card-images"
            multiple
            accept="image/*"
            onChange={handleFileChange}
            ref={fileInputRef}
            className="block w-full text-sm text-gray-500
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-md file:border-0
                       file:text-sm file:font-semibold
                       file:bg-blue-50 file:text-blue-700
                       hover:file:bg-blue-100"
          />
          {selectedFiles.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              選択中のファイル: {selectedFiles.map(f => f.name).join(', ')}
            </div>
          )}
        </div>
        <button
          onClick={handleSubmit}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
        >
          <UploadCloud size={20} /> アップロード開始
        </button>
      </Modal>
    );
  };

  // カード編集モーダル
  const CardEditModal = ({ isOpen, onClose, card, onSave, onDelete, sets }) => { // customAttributesを削除
    const [editedCard, setEditedCard] = useState(card);

    useEffect(() => {
      setEditedCard(card);
    }, [card]);

    if (!editedCard) return null;

    const handleChange = (e) => {
      const { name, value, type, checked } = e.target;
      setEditedCard(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : (name === 'rating' ? parseFloat(value) : (name === 'manaCost' ? parseInt(value) : value))
      }));
    };

    const handleSubmit = () => {
      onSave(editedCard.id, editedCard);
      onClose();
    };

    const handleDelete = () => {
      onDelete(editedCard.id, editedCard.imageUrl);
      onClose();
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カードを編集">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex justify-center mb-4">
            {editedCard.imageUrl ? (
              <img src={editedCard.imageUrl} alt={editedCard.name} className="max-h-64 rounded-md shadow-md" />
            ) : (
              <div className="w-48 h-64 bg-gray-200 flex items-center justify-center rounded-md text-gray-400">
                <ImageIcon size={48} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">カード名:</label>
            <input
              type="text"
              name="name"
              value={editedCard.name || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">色:</label>
            <select
              name="color"
              value={editedCard.color || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              {COLORS.map(color => <option key={color} value={color}>{color}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">レアリティ:</label>
            <select
              name="rarity"
              value={editedCard.rarity || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              {RARITIES.map(rarity => <option key={rarity} value={rarity}>{rarity}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">カードタイプ:</label>
            <select
              name="type"
              value={editedCard.type || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              {CARD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">評価:</label>
            <input
              type="number"
              name="rating"
              step="0.1"
              min="0.0"
              max="5.0"
              value={editedCard.rating !== undefined ? editedCard.rating : ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          {/* マナコスト入力欄 */}
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">マナコスト:</label>
            <input
              type="number"
              name="manaCost"
              min="0"
              value={editedCard.manaCost !== undefined ? editedCard.manaCost : ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>
          {/* セット選択を追加 */}
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">セット:</label>
            <select
              name="setId"
              value={editedCard.setId || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="">セットを選択</option>
              {sets.map(set => ( // sets propを使用
                <option key={set.id} value={set.id}>{set.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-gray-700 text-sm font-bold mb-2">コメント:</label>
            <textarea
              name="comment"
              value={editedCard.comment || ''}
              onChange={handleChange}
              rows="3"
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            ></textarea>
          </div>
          {/* カスタム属性の選択を削除 */}
        </div>
        <div className="mt-6 flex justify-between">
          <button
            onClick={handleDelete}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
          >
            <Trash2 size={20} /> 削除
          </button>
          <button
            onClick={handleSubmit}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
          >
            <Save size={20} /> 保存
          </button>
        </div>
      </Modal>
    );
  };

  // カスタム属性管理モーダル
  const CustomAttributeModal = ({ isOpen, onClose, customAttributes, onAdd, onDelete }) => {
    const [newAttributeName, setNewAttributeName] = useState('');

    const handleAdd = () => {
      if (newAttributeName.trim()) {
        onAdd(newAttributeName);
        setNewAttributeName('');
      } else {
        showMessage("属性名を入力してください。", "error");
      }
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カスタム属性を管理">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="new-attribute">
            新しい属性を追加:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="new-attribute"
              value={newAttributeName}
              onChange={(e) => setNewAttributeName(e.target.value)}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="例: 除去カード"
            />
            <button
              onClick={handleAdd}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
            >
              <Plus size={20} /> 追加
            </button>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-2 text-gray-800">既存の属性:</h3>
          {customAttributes.length === 0 ? (
            <p className="text-gray-600">カスタム属性はまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {customAttributes.map(attr => {
                const CustomIcon = CUSTOM_ATTRIBUTE_ICONS[attr.name] || Plus;
                return (
                  <li key={attr.id} className="flex items-center justify-between bg-gray-100 p-3 rounded-md shadow-sm">
                    <span className="flex items-center gap-2 text-gray-800">
                      <CustomIcon size={18} /> {attr.name}
                    </span>
                    <button
                      onClick={() => onDelete(attr.id)}
                      className="text-red-500 hover:text-red-700 transition-colors duration-200"
                      aria-label={`${attr.name} を削除`}
                    >
                      <Trash2 size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Modal>
    );
  };

  // セット管理モーダル (新規追加)
  const SetManagementModal = ({ isOpen, onClose, sets, onAddSet, onDeleteSet }) => {
    const [newSetName, setNewSetName] = useState('');
    const handleAdd = () => {
      if (newSetName.trim()) {
        onAddSet(newSetName.trim());
        setNewSetName('');
      } else {
        showMessage("セット名を入力してください。", "error");
      }
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="セットを管理">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="new-set-name">
            新しいセットを追加:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              id="new-set-name"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              placeholder="例: モダンホライゾン3"
            />
            <button
              onClick={handleAdd}
              className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 flex items-center gap-2"
            >
              <Plus size={20} /> 追加
            </button>
          </div>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-2 text-gray-800">既存のセット:</h3>
          {sets.length === 0 ? (
            <p className="text-gray-600">セットはまだありません。</p>
          ) : (
            <ul className="space-y-2">
              {sets.map(set => (
                <li key={set.id} className="flex items-center justify-between bg-gray-100 p-3 rounded-md shadow-sm">
                  <span className="text-gray-800">{set.name}</span>
                  <button
                    onClick={() => onDeleteSet(set.id)}
                    className="text-red-500 hover:text-red-700 transition-colors duration-200"
                    aria-label={`${set.name} を削除`}
                  >
                    <Trash2 size={20} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    );
  };


  // レアリティ一括割り当てモーダル
  const RarityAssignmentModal = ({ isOpen, onClose, cards, onUpdateCards }) => {
    // レアリティが設定されていないカードのみをフィルタリング
    const unassignedCards = cards.filter(card => !card.rarity || card.rarity === '');

    const [selectedCards, setSelectedCards] = useState([]);
    const [selectedRarity, setSelectedRarity] = useState('');

    useEffect(() => {
      setSelectedCards([]); // モーダルが開くたびに選択をリセット
      setSelectedRarity('');
    }, [isOpen]);

    const handleCardSelect = (cardId) => {
      setSelectedCards(prev =>
        prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
      );
    };

    const handleSelectAll = () => {
      if (selectedCards.length === unassignedCards.length) { // フィルタリングされたリストに対して全選択/全解除
        setSelectedCards([]);
      } else {
        setSelectedCards(unassignedCards.map(card => card.id));
      }
    };

    const handleApplyRarity = async () => {
      if (selectedCards.length === 0 || !selectedRarity) {
        showMessage("カードとレアリティを選択してください。", "error");
        return;
      }

      setLoading(true);
      const updates = selectedCards.map(cardId =>
        updateDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, cardId), { rarity: selectedRarity, updatedAt: new Date() })
      );

      try {
        await Promise.all(updates);
        showMessage(`${selectedCards.length}枚のカードのレアリティを更新しました。`);
        onClose();
      } catch (error) {
        console.error("Error updating rarities:", error);
        showMessage("レアリティの一括更新に失敗しました。", "error");
      } finally {
        setLoading(false);
      }
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="レアリティの一括割り当て">
        <div className="mb-4 flex items-center justify-between">
          <label className="block text-gray-700 text-sm font-bold">
            適用するレアリティ:
          </label>
          <select
            value={selectedRarity}
            onChange={(e) => setSelectedRarity(e.target.value)}
            className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-1/2"
          >
            <option value="">選択してください</option>
            {RARITIES.map(rarity => (
              <option key={rarity} value={rarity}>{rarity}</option>
            ))}
          </select>
        </div>
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={handleSelectAll}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-md transition-colors duration-200"
          >
            {selectedCards.length === unassignedCards.length ? 'すべて選択解除' : 'すべて選択'}
          </button>
          <span className="text-gray-600 text-sm">選択中のカード: {selectedCards.length} / {unassignedCards.length}</span>
        </div>
        <div className="max-h-96 overflow-y-auto border rounded-md p-2 mb-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {unassignedCards.length === 0 ? (
            <p className="col-span-full text-center text-gray-600 py-4">
              このセットには、まだレアリティが未設定のカードはありません。
            </p>
          ) : (
            unassignedCards.map(card => ( // フィルタリングされたカードリストを使用
              <div
                key={card.id}
                className={`relative cursor-pointer border-2 rounded-md overflow-hidden transition-all duration-150
                            ${selectedCards.includes(card.id) ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-300'}`}
                onClick={() => handleCardSelect(card.id)}
              >
                <img
                  src={card.imageUrl || `https://placehold.co/100x140/cccccc/333333?text=No+Image`}
                  alt={card.name || 'カード画像'}
                  className="w-full h-auto object-cover"
                />
                {selectedCards.includes(card.id) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-50 text-white text-xl font-bold">
                    ✓
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 truncate">
                  {card.name || 'Unnamed'}
                </div>
              </div>
            ))
          )}
        </div>
        <button
          onClick={handleApplyRarity}
          disabled={selectedCards.length === 0 || !selectedRarity}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={20} /> レアリティを適用
        </button>
      </Modal>
    );
  };

  // カードタイプ一括割り当てモーダル (新規追加)
  const TypeAssignmentModal = ({ isOpen, onClose, cards, onUpdateCards }) => {
    // タイプが設定されていないカードのみをフィルタリング
    const unassignedCards = cards.filter(card => !card.type || card.type === '');

    const [selectedCards, setSelectedCards] = useState([]);
    const [selectedType, setSelectedType] = useState('');

    useEffect(() => {
      setSelectedCards([]); // モーダルが開くたびに選択をリセット
      setSelectedType('');
    }, [isOpen]);

    const handleCardSelect = (cardId) => {
      setSelectedCards(prev =>
        prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]
      );
    };

    const handleSelectAll = () => {
      if (selectedCards.length === unassignedCards.length) {
        setSelectedCards([]);
      } else {
        setSelectedCards(unassignedCards.map(card => card.id));
      }
    };

    const handleApplyType = async () => {
      if (selectedCards.length === 0 || !selectedType) {
        showMessage("カードとタイプを選択してください。", "error");
        return;
      }

      setLoading(true);
      const updates = selectedCards.map(cardId =>
        updateDoc(doc(db, `artifacts/${appId}/users/${userId}/cards`, cardId), { type: selectedType, updatedAt: new Date() })
      );

      try {
        await Promise.all(updates);
        showMessage(`${selectedCards.length}枚のカードのタイプを更新しました。`);
        onClose();
      } catch (error) {
        console.error("Error updating types:", error);
        showMessage("タイプの一括更新に失敗しました。", "error");
      } finally {
        setLoading(false);
      }
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カードタイプの一括割り当て">
        <div className="mb-4 flex items-center justify-between">
          <label className="block text-gray-700 text-sm font-bold">
            適用するカードタイプ:
          </label>
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="shadow border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-1/2"
          >
            <option value="">選択してください</option>
            {CARD_TYPES.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={handleSelectAll}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-md transition-colors duration-200"
          >
            {selectedCards.length === unassignedCards.length ? 'すべて選択解除' : 'すべて選択'}
          </button>
          <span className="text-gray-600 text-sm">選択中のカード: {selectedCards.length} / {unassignedCards.length}</span>
        </div>
        <div className="max-h-96 overflow-y-auto border rounded-md p-2 mb-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
          {unassignedCards.length === 0 ? (
            <p className="col-span-full text-center text-gray-600 py-4">
              このセットには、まだカードタイプが未設定のカードはありません。
            </p>
          ) : (
            unassignedCards.map(card => (
              <div
                key={card.id}
                className={`relative cursor-pointer border-2 rounded-md overflow-hidden transition-all duration-150
                            ${selectedCards.includes(card.id) ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-300'}`}
                onClick={() => handleCardSelect(card.id)}
              >
                <img
                  src={card.imageUrl || `https://placehold.co/100x140/cccccc/333333?text=No+Image`}
                  alt={card.name || 'カード画像'}
                  className="w-full h-auto object-cover"
                />
                {selectedCards.includes(card.id) && (
                  <div className="absolute inset-0 flex items-center justify-center bg-blue-500 bg-opacity-50 text-white text-xl font-bold">
                    ✓
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 truncate">
                  {card.name || 'Unnamed'}
                </div>
              </div>
            ))
          )}
        </div>
        <button
          onClick={handleApplyType}
          disabled={selectedCards.length === 0 || !selectedType}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={20} /> タイプを適用
        </button>
      </Modal>
    );
  };


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 font-inter text-gray-900 p-4 sm:p-6">
      <style>{`
        .animate-scale-in {
          animation: scaleIn 0.3s ease-out forwards;
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.3s ease-out forwards;
        }
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <header className="bg-white rounded-lg shadow-md p-4 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
        <h1 className="text-3xl font-bold text-blue-700">MTGリミテッド評価ツール</h1>
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center">
          {/* 現在のセット選択ドロップダウン */}
          <div className="flex items-center gap-2">
            <label htmlFor="set-selector" className="text-gray-700 font-semibold flex items-center gap-1">
              <BookOpenText size={20} /> 現在のセット:
            </label>
            <select
              id="set-selector"
              value={currentSetId || ''}
              onChange={(e) => setCurrentSetId(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">セットを選択</option>
              {sets.map(set => (
                <option key={set.id} value={set.id}>{set.name}</option>
              ))}
            </select>
          </div>

          {!isStealthMode && (
            <>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2"
              >
                <UploadCloud size={20} /> カードをアップロード
              </button>
              <button
                onClick={() => setIsRarityModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2"
              >
                <List size={20} /> レアリティ一括設定
              </button>
              <button
                onClick={() => setIsTypeAssignmentModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2"
              >
                <Type size={20} /> タイプ一括設定
              </button>
              <button
                onClick={() => setIsCustomAttrModalOpen(true)}
                className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2"
              >
                <Plus size={20} /> 属性を管理
              </button>
              <button
                onClick={() => setIsSetManagementModalOpen(true)}
                className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2"
              >
                <BookOpenText size={20} /> セットを管理
              </button>
            </>
          )}
          {/* 非表示モード切り替えボタン */}
          <button
            onClick={() => setIsStealthMode(prev => !prev)}
            className={`py-2 px-4 rounded-md shadow-md transition-colors duration-200 flex items-center gap-2
                        ${isStealthMode ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-300 hover:bg-gray-400 text-gray-800'}`}
          >
            {isStealthMode ? <EyeOff size={20} /> : <Eye size={20} />}
            {isStealthMode ? '非表示モード中' : '非表示モード'}
          </button>
        </div>
      </header>

      {/* フィルターとソート、表示モード */}
      <section className="bg-white rounded-lg shadow-md p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Filter size={20} /> フィルター</h2>
          <div className="relative flex-grow min-w-[200px]">
            <input
              type="text"
              placeholder="カード名やコメントで検索..."
              value={filters.searchTerm}
              onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
              className="w-full p-2 pl-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* 色フィルター */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1"><Palette size={16} /> 色:</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(color => (
                <label key={color} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.colors.includes(color)}
                    onChange={() => {
                      setFilters(prev => ({
                        ...prev,
                        colors: prev.colors.includes(color)
                          ? prev.colors.filter(c => c !== color)
                          : [...prev.colors, color]
                      }));
                    }}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-800 text-sm">{color}</span>
                </label>
              ))}
            </div>
          </div>

          {/* レアリティフィルター */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1"><Star size={16} /> レアリティ:</label>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map(rarity => (
                <label key={rarity} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.rarities.includes(rarity)}
                    onChange={() => {
                      setFilters(prev => ({
                        ...prev,
                        rarities: prev.rarities.includes(rarity)
                          ? prev.rarities.filter(r => r !== rarity)
                          : [...prev.rarities, rarity]
                      }));
                    }}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-800 text-sm">{rarity}</span>
                </label>
              ))}
            </div>
          </div>

          {/* カードタイプフィルター */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1"><Type size={16} /> カードタイプ:</label>
            <div className="flex flex-wrap gap-2">
              {CARD_TYPES.map(type => (
                <label key={type} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.types.includes(type)}
                    onChange={() => {
                      setFilters(prev => ({
                        ...prev,
                        types: prev.types.includes(type)
                          ? prev.types.filter(t => t !== type)
                          : [...prev.types, type]
                      }));
                    }}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-800 text-sm">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* カスタム属性フィルター */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1"><Plus size={16} /> カスタム属性:</label>
            <div className="flex flex-wrap gap-2">
              {customAttributes.map(attr => (
                <label key={attr.id} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.customAttributeIds.includes(attr.id)}
                    onChange={() => {
                      setFilters(prev => ({
                        ...prev,
                        customAttributeIds: prev.customAttributeIds.includes(attr.id)
                          ? prev.customAttributeIds.filter(id => id !== attr.id)
                          : [...prev.customAttributeIds, attr.id]
                      }));
                    }}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-800 text-sm">{attr.name}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-gray-200">
          {/* ボムレアフィルター */}
          <label className="flex items-center space-x-2 cursor-pointer bg-yellow-100 p-2 rounded-md shadow-sm">
            <input
              type="checkbox"
              checked={filters.isBomb}
              onChange={() => setFilters(prev => ({ ...prev, isBomb: !prev.isBomb }))}
              className="form-checkbox h-5 w-5 text-yellow-500 rounded"
            />
            <Star size={20} className="text-yellow-500" fill="currentColor" />
            <span className="text-gray-800 font-semibold">ボムレアのみ表示</span>
          </label>

          {/* ソートオプション */}
          <div className="flex items-center gap-2 ml-auto">
            <label htmlFor="sort-by" className="text-gray-700 font-semibold">並べ替え:</label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="rating-desc">評価 (高い順)</option>
              <option value="rating-asc">評価 (低い順)</option>
              <option value="manaCost-asc">コスト (低い順)</option> {/* 新しいソートオプション */}
              <option value="manaCost-desc">コスト (高い順)</option> {/* 新しいソートオプション */}
              <option value="name-asc">名前 (A-Z)</option>
              <option value="name-desc">名前 (Z-A)</option>
            </select>
          </div>

          {/* 表示モード切り替え */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDisplayMode('grid')}
              className={`p-2 rounded-md transition-colors duration-200 ${displayMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              aria-label="グリッド表示"
            >
              <List size={20} />
            </button>
            <button
              onClick={() => setDisplayMode('tier')}
              className={`p-2 rounded-md transition-colors duration-200 ${displayMode === 'tier' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              aria-label="Tierリスト表示"
            >
              <Hash size={20} />
            </button>
          </div>
        </div>
      </section>

      {/* カード表示エリア */}
      <main>
        {filteredAndSortedCards.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-600">
            <p className="text-lg mb-4">
              {currentSetId ? 'このセットには表示するカードがありません。' : 'セットが選択されていません。'}
            </p>
            <p>フィルターを調整するか、新しいカードをアップロードしてください。</p>
            {!currentSetId && sets.length === 0 && (
              <p className="mt-2 text-blue-600">
                まずは「セットを管理」ボタンから新しいセットを追加してください。
              </p>
            )}
            {!currentSetId && sets.length > 0 && (
              <p className="mt-2 text-blue-600">
                ヘッダーのドロップダウンからセットを選択してください。
              </p>
            )}
          </div>
        ) : (
          <>
            {displayMode === 'grid' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 xl:grid-cols-7 gap-6"> {/* グリッドレイアウトを調整: 7列 */}
                {filteredAndSortedCards.map(card => (
                  <CardItem
                    key={card.id}
                    card={card}
                    onEdit={setEditingCard}
                    onToggleBomb={handleToggleBomb}
                    onRatingChange={handleRatingChange}
                    onManaCostChange={handleManaCostChange} // 新しいプロップ
                    onToggleCustomAttribute={handleToggleCustomAttribute} // 新しいプロップ
                    customAttributes={customAttributes}
                    isStealthMode={isStealthMode} // 新しいプロップ
                  />
                ))}
              </div>
            )}

            {displayMode === 'tier' && (
              <div className="space-y-8">
                {Object.keys(tieredCards).sort((a, b) => parseInt(b) - parseInt(a)).map(tierKey => (
                  tieredCards[tierKey].length > 0 && (
                    <div key={tierKey} className="bg-white rounded-lg shadow-md p-6">
                      <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b-2 border-blue-500">
                        Tier {tierKey}.0 - {parseFloat(tierKey) + 0.9}
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 xl:grid-cols-7 gap-6"> {/* グリッドレイアウトを調整: 7列 */}
                        {tieredCards[tierKey].map(card => (
                          <CardItem
                            key={card.id}
                            card={card}
                            onEdit={setEditingCard}
                            onToggleBomb={handleToggleBomb}
                            onRatingChange={handleRatingChange}
                            onManaCostChange={handleManaCostChange} // 新しいプロップ
                            onToggleCustomAttribute={handleToggleCustomAttribute} // 新しいプロップ
                            customAttributes={customAttributes}
                            isStealthMode={isStealthMode} // 新しいプロップ
                          />
                        ))}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* モーダル */}
      <CardUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUpload={handleUploadCards}
        sets={sets} // セットリストを渡す
        currentSetId={currentSetId} // 現在のセットIDを渡す
      />
      {editingCard && (
        <CardEditModal
          isOpen={isEditModalOpen || editingCard !== null}
          onClose={() => { setEditingCard(null); setIsEditModalOpen(false); }}
          card={editingCard}
          onSave={handleUpdateCard}
          onDelete={handleDeleteCard}
          sets={sets} // セットリストを渡す
        />
      )}
      <CustomAttributeModal
        isOpen={isCustomAttrModalOpen}
        onClose={() => setIsCustomAttrModalOpen(false)}
        customAttributes={customAttributes}
        onAdd={handleAddCustomAttribute}
        onDelete={handleDeleteCustomAttribute}
      />
      <RarityAssignmentModal
        isOpen={isRarityModalOpen}
        onClose={() => setIsRarityModalOpen(false)}
        cards={cards} // 全てのカードを渡すが、モーダル内でフィルタリングされる
        onUpdateCards={handleUpdateCard} // この関数はRarityAssignmentModal内で直接Firestoreを更新する
      />
      <TypeAssignmentModal
        isOpen={isTypeAssignmentModalOpen}
        onClose={() => setIsTypeAssignmentModalOpen(false)}
        cards={cards}
        onUpdateCards={handleUpdateCard}
      />
      <SetManagementModal
        isOpen={isSetManagementModalOpen}
        onClose={() => setIsSetManagementModalOpen(false)}
        sets={sets}
        onAddSet={handleAddSet}
        onDeleteSet={handleDeleteSet}
      />

      {/* メッセージボックス */}
      {message && (
        <MessageBox
          message={message}
          type={messageType}
          onClose={() => setMessage(null)}
        />
      )}
    </div>
  );
}

export default App;
