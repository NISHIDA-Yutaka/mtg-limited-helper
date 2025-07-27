import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  UploadCloud, XCircle, ChevronDown, ChevronUp, Star, Filter, Edit, Save, Trash2, Plus, Search, Image as ImageIcon,
  Palette, Swords, Feather, ScrollText, LandPlot, Shield, Zap, RefreshCcw, Eye, Heart, List, Hash, Type, Skull, BookOpenText,
  EyeOff, RefreshCcw as FlipIcon, ArrowRight, Ghost, MessageSquare // MessageSquare アイコンを追加
} from 'lucide-react'; // アイコンライブラリ

// Firebaseの設定は環境変数から取得
// Canvas環境ではグローバル変数 (__app_id, __firebase_config, __initial_auth_token) が提供されますが、
// ローカル開発環境では process.env から読み込むようにフォールバックします。
// eslint-disable-next-line no-undef
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : process.env.REACT_APP_FIREBASE_APP_ID || 'default-app-id';
// eslint-disable-next-line no-undef
const FIREBASE_CONFIG = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : (
  process.env.REACT_APP_FIREBASE_CONFIG ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG) : {}
);
// eslint-disable-next-line no-undef
const INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : process.env.REACT_APP_FIREBASE_AUTH_TOKEN || null;

// カードタイプと色の定義
const CARD_TYPES = ['クリーチャー', 'インスタント', 'ソーサリー', 'エンチャント', 'アーティファクト', 'プレインズウォーカー', '土地'];
// 色は単色と無色のみを定義。多色はカードデータで複数色を持つことで表現
const PRIMARY_COLORS = ['白', '青', '黒', '赤', '緑', '無色'];
const FILTER_COLORS = ['白', '青', '黒', '赤', '緑', '多色', '無色']; // フィルターに表示する色オプション
const RARITIES = ['コモン', 'アンコモン', 'レア', '神話レア'];

// カスタム属性のアイコンマッピング（事前に用意するアイコン）
const CUSTOM_ATTRIBUTE_ICONS = {
  '除去': Swords,
  '飛行': Feather,
  'ドロー': ScrollText,
  '警戒': Eye,
  '接死': Skull,
  '到達': ArrowRight, // 弓矢っぽいものとしてArrowRightを使用
  '疑似クリーチャー': Ghost, // 恐竜っぽいものとしてGhostを使用
  '土地加速': LandPlot,
  'カウンター': Shield,
  '火力': Zap,
  '墓地対策': FlipIcon,
  'ライフロス': Heart,
  'トークン生成': Plus,
  'ルーティング': Search,
  'トランプル': Hash,
  '先制攻撃': Type,
};

// モーダルコンポーネント
const Modal = ({ isOpen, onClose, title, children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-y-auto">
      {/* max-w-7xl に設定 */}
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full p-6 relative transform transition-all duration-300 scale-95 opacity-0 animate-scale-in">
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

// カードアイテムコンポーネント (UPDATED: コメント表示機能追加)
const CardItem = ({ card, onEdit, onToggleBomb, onRatingChange, onManaCostChange, onToggleCustomAttribute, customAttributes, isStealthMode }) => {
  const IconComponent = card.isBomb ? Star : Star; // ボムレアのアイコンは常にStar
  const iconColorClass = card.isBomb ? 'text-yellow-400' : 'text-gray-400';
  const [isFlipped, setIsFlipped] = useState(false); // DFC用フリップ状態

  // DFCでないカードがフリップ状態になったらリセット
  useEffect(() => {
    if (!card.isDoubleFaced && isFlipped) {
      setIsFlipped(false);
    }
  }, [card.isDoubleFaced, isFlipped]);

  // 265x370 の比率を維持するための padding-bottom 計算
  // height / width = 370 / 265 = 1.396226...
  const aspectRatioPadding = (370 / 265) * 100; // %

  const displayedImageUrl = isFlipped && card.isDoubleFaced && card.backFaceImageUrl
    ? card.backFaceImageUrl
    : card.imageUrl;

  const hasComment = card.comment && card.comment.trim() !== '';

  return (
    <div className="relative bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden flex flex-col group">
      {/* カード画像コンテナ: w-fullで幅を確保し、padding-bottomで高さを比率に合わせて設定 */}
      <div
        className="relative w-full bg-gray-200 flex items-center justify-center overflow-hidden cursor-pointer"
        style={{ paddingBottom: `${aspectRatioPadding}%` }}
        onClick={() => onEdit(card)} // カード画像クリックで編集モーダルを開く
      >
        {displayedImageUrl ? (
          <img
            src={displayedImageUrl}
            alt={card.name || 'カード画像'}
            className="absolute inset-0 w-full h-full object-cover" // 画像をコンテナいっぱいに表示
            onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/265x370/cccccc/333333?text=No+Image`; }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <ImageIcon size={48} className="text-gray-400" />
          </div>
        )}

        {/* コメントホバー時のオーバーレイ */}
        {hasComment && (
          <div className="absolute inset-0 bg-black bg-opacity-70 text-white p-2 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <p className="text-sm text-center whitespace-pre-wrap">{card.comment}</p>
          </div>
        )}

        {/* アイコンオーバーレイ (左下) */}
        <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
          {/* コメントアイコン */}
          {hasComment && (
            <span className="bg-purple-600 bg-opacity-85 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1" title="コメントあり">
              <MessageSquare size={12} />
            </span>
          )}
          {/* カスタム属性アイコン */}
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
        {/* DFCフリップボタン */}
        {!isStealthMode && card.isDoubleFaced && (
          <button
            onClick={(e) => { e.stopPropagation(); setIsFlipped(prev => !prev); }} // クリックイベントの伝播を停止
            className="absolute top-2 left-2 p-1 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-colors duration-200 text-white z-10"
            aria-label={isFlipped ? "表面に戻す" : "裏面を表示"}
          >
            <FlipIcon size={20} />
          </button>
        )}
      </div>

      {/* カード情報と評価 */}
      <div className="p-4 flex flex-col flex-grow">
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
                onClick={(e) => { e.stopPropagation(); onToggleBomb(card.id); }}
                className={`ml-2 p-1 rounded-full bg-black bg-opacity-50 hover:bg-opacity-75 transition-colors duration-200 ${iconColorClass}`}
                aria-label={card.isBomb ? "ボムレア解除" : "ボムレアに設定"}
              >
                <IconComponent size={20} fill={card.isBomb ? 'currentColor' : 'none'} />
              </button>
            </div>
            <div className="flex items-center mb-2">
              <label htmlFor={`mana-cost-${card.id}`} className="text-gray-700 mr-2">
                コスト:
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
  // Firebaseインスタンスをstateで管理
  const [firebaseApp, setFirebaseApp] = useState(null);
  const [firestoreDb, setFirestoreDb] = useState(null);
  const [firebaseAuth, setFirebaseAuth] = useState(null);
  const [firebaseStorage, setFirebaseStorage] = useState(null);
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState([]);
  const [customAttributes, setCustomAttributes] = useState([]);
  const [sets, setSets] = useState([]);
  const [currentSetId, setCurrentSetId] = useState(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [isCustomAttrModalOpen, setIsCustomAttrModalOpen] = useState(false);
  const [isRarityModalOpen, setIsRarityModalOpen] = useState(false);
  const [isTypeAssignmentModalOpen, setIsTypeAssignmentModalOpen] = useState(false);
  const [isSetManagementModalOpen, setIsSetManagementModalOpen] = useState(false);
  const [isStealthMode, setIsStealthMode] = useState(false);

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
  const [sortBy, setSortBy] = useState('default');
  const [displayMode, setDisplayMode] = useState('grid'); // 'grid', 'tier'

  // Firebase初期化
  useEffect(() => {
    const initializeFirebaseServices = async () => {
      if (Object.keys(FIREBASE_CONFIG).length === 0) {
        console.error("Firebase configuration is empty. Check your .env file or __firebase_config.");
        setLoading(false);
        return;
      }

      try {
        const appInstance = initializeApp(FIREBASE_CONFIG);
        setFirebaseApp(appInstance);
        setFirestoreDb(getFirestore(appInstance));
        setFirebaseAuth(getAuth(appInstance));
        setFirebaseStorage(getStorage(appInstance));

        const authInstance = getAuth(appInstance);
        const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            try {
              const anonymousUser = await signInAnonymously(authInstance);
              setUserId(anonymousUser.user.uid);
            } catch (anonError) {
              console.error("Error signing in anonymously:", anonError);
            }
          }
          setLoading(false);
        });

        if (INITIAL_AUTH_TOKEN) {
          try {
            await signInWithCustomToken(authInstance, INITIAL_AUTH_TOKEN);
          } catch (error) {
            console.error("Error signing in with custom token:", error);
            try {
              await signInAnonymously(authInstance);
            } catch (anonError) {
              console.error("Error signing in anonymously after custom token failure:", anonError);
            }
          }
        } else {
          try {
            await signInAnonymously(authInstance);
          } catch (anonError) {
            console.error("Error signing in anonymously:", anonError);
          }
        }

        return () => unsubscribe();
      } catch (error) {
        console.error("Firebase initialization failed:", error);
        setLoading(false);
      }
    };

    initializeFirebaseServices();
  }, []);

  // Firestoreからのデータ取得 (カード、カスタム属性、セット)
  useEffect(() => {
    if (!firestoreDb || !userId) return;

    const cardsCollectionRef = collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`);
    const unsubscribeCards = onSnapshot(cardsCollectionRef, (snapshot) => {
      const fetchedCards = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCards(fetchedCards);
    }, (error) => {
      console.error("Error fetching cards:", error);
    });

    const customAttrsCollectionRef = collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/customAttributes`);
    const unsubscribeCustomAttrs = onSnapshot(customAttrsCollectionRef, (snapshot) => {
      const fetchedAttrs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCustomAttributes(fetchedAttrs);
    }, (error) => {
      console.error("Error fetching custom attributes:", error);
    });

    const setsCollectionRef = collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/sets`);
    const unsubscribeSets = onSnapshot(setsCollectionRef, (snapshot) => {
      const fetchedSets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSets(fetchedSets);
      if (fetchedSets.length > 0 && (!currentSetId || !fetchedSets.some(s => s.id === currentSetId))) {
        setCurrentSetId(fetchedSets[0].id);
      } else if (fetchedSets.length === 0) {
        setCurrentSetId(null);
      }
    }, (error) => {
      console.error("Error fetching sets:", error);
    });

    return () => {
      unsubscribeCards();
      unsubscribeCustomAttrs();
      unsubscribeSets();
    };
  }, [firestoreDb, userId, currentSetId]);

  // カードアップロード処理
  const handleUploadCards = async (files, colors, setId, isDoubleFaced, backFaceFile) => {
    if (!userId || !firebaseStorage || !firestoreDb) {
      console.error("Firebaseサービスが利用できません。");
      return;
    }
    if (!setId) {
      console.error("カードをアップロードするセットを選択してください。");
      setIsUploadModalOpen(true);
      return;
    }
    if (isDoubleFaced && files.length !== 1) {
      console.error("裏表のあるカードをアップロードする場合、表面の画像は1枚のみ選択してください。");
      return;
    }
    if (isDoubleFaced && !backFaceFile) {
      console.error("裏表のあるカードの場合、裏面画像も選択してください。");
      return;
    }
    if (colors.length === 0) {
      console.error("カードの色を1つ以上選択してください。");
      return;
    }

    setLoading(true);
    for (const file of files) {
      try {
        const storageRef = ref(firebaseStorage, `card_images/${userId}/${file.name}`);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);

        let backFaceImageUrl = null;
        if (isDoubleFaced && backFaceFile) {
          const backStorageRef = ref(firebaseStorage, `card_images/${userId}/back_${backFaceFile.name}`);
          await uploadBytes(backStorageRef, backFaceFile);
          backFaceImageUrl = await getDownloadURL(backStorageRef);
        }

        const newCard = {
          name: file.name.split('.')[0],
          color: colors,
          rarity: '',
          type: '',
          rating: 0.0,
          manaCost: null,
          isBomb: false,
          isDoubleFaced: isDoubleFaced,
          backFaceImageUrl: backFaceImageUrl,
          customAttributeIds: [],
          imageUrl: imageUrl,
          comment: '',
          setId: setId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        await addDoc(collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`), newCard);
      } catch (error) {
        console.error("Error uploading card:", file.name, error);
      }
    }
    setLoading(false);
    setIsUploadModalOpen(false);
    console.log("カードをアップロードしました！");
  };

  // カード情報更新処理
  const handleUpdateCard = async (cardId, updatedFields) => {
    if (!userId || !firestoreDb) return;
    try {
      const cardRef = doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardId);
      await updateDoc(cardRef, { ...updatedFields, updatedAt: new Date() });
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  // カード削除処理
  const handleDeleteCard = async (cardId, imageUrl, backFaceImageUrl) => {
    if (!userId || !firestoreDb || !firebaseStorage) return;
    const userConfirmed = window.confirm('本当にこのカードを削除しますか？');
    if (!userConfirmed) return;

    setLoading(true);
    try {
      if (imageUrl) {
        const url = new URL(imageUrl);
        const path = decodeURIComponent(url.pathname);
        const storageBucketPath = url.hostname.split('.')[0];
        const fullPath = path.startsWith('/o/') ? path.substring(3) : path;
        const imagePath = fullPath.startsWith(`${storageBucketPath}/`) ? fullPath.substring(storageBucketPath.length + 1) : fullPath;
        const storageRef = ref(firebaseStorage, imagePath);
        await deleteObject(storageRef);
      }
      if (backFaceImageUrl) {
        const url = new URL(backFaceImageUrl);
        const path = decodeURIComponent(url.pathname);
        const storageBucketPath = url.hostname.split('.')[0];
        const fullPath = path.startsWith('/o/') ? path.substring(3) : path;
        const imagePath = fullPath.startsWith(`${storageBucketPath}/`) ? fullPath.substring(storageBucketPath.length + 1) : fullPath;
        const storageRef = ref(firebaseStorage, imagePath);
        await deleteObject(storageRef);
      }
      await deleteDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardId));
    } catch (error) {
      console.error("Error deleting card:", error);
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
    const clampedRating = Math.max(0.0, Math.min(5.0, newRating));
    const roundedRating = Math.round(clampedRating * 10) / 10;
    handleUpdateCard(cardId, { rating: roundedRating });
  };

  // マナコスト変更
  const handleManaCostChange = (cardId, newManaCost) => {
    const parsedCost = parseInt(newManaCost);
    const validatedCost = isNaN(parsedCost) || parsedCost < 0 ? null : parsedCost;
    handleUpdateCard(cardId, { manaCost: validatedCost });
  };

  // カスタム属性の追加
  const handleAddCustomAttribute = async (name) => {
    if (!userId || !name.trim() || !firestoreDb) return;
    try {
      await addDoc(collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/customAttributes`), { name: name.trim() });
    } catch (error) {
      console.error("Error adding custom attribute:", error);
    }
  };

  // カスタム属性の削除
  const handleDeleteCustomAttribute = async (attrId) => {
    if (!userId || !firestoreDb) return;
    const userConfirmed = window.confirm('このカスタム属性を削除しますか？この属性が割り当てられているカードからも削除されます。');
    if (!userConfirmed) return;
    try {
      const cardsToUpdate = cards.filter(card => card.customAttributeIds && card.customAttributeIds.includes(attrId));
      for (const card of cardsToUpdate) {
        await updateDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, card.id), {
          customAttributeIds: card.customAttributeIds.filter(id => id !== attrId)
        });
      }
      await deleteDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/customAttributes`, attrId));
    } catch (error) {
      console.error("Error deleting custom attribute:", error);
    }
  };

  // カードのカスタム属性をトグルする
  const handleToggleCustomAttribute = async (cardId, attributeId) => {
    if (!userId || !firestoreDb) return;
    const cardToUpdate = cards.find(card => card.id === cardId);
    if (!cardToUpdate) return;

    const currentAttributes = cardToUpdate.customAttributeIds || [];
    const newAttributes = currentAttributes.includes(attributeId)
      ? currentAttributes.filter(id => id !== attributeId)
      : [...currentAttributes, attributeId];

    try {
      await updateDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardId), {
        customAttributeIds: newAttributes,
        updatedAt: new Date(),
      });
    } catch (error) {
      console.error("Error toggling custom attribute:", error);
    }
  };

  // セットの追加
  const handleAddSet = async (name) => {
    if (!userId || !name.trim() || !firestoreDb) return;
    try {
      const newSetRef = await addDoc(collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/sets`), { name: name.trim(), createdAt: new Date() });
      setCurrentSetId(newSetRef.id);
    } catch (error) {
      console.error("Error adding set:", error);
    }
  };

  // セットの削除
  const handleDeleteSet = async (setId) => {
    if (!userId || !firestoreDb) return;
    const userConfirmed = window.confirm('このセットを削除しますか？このセットに紐づくカードもすべて削除されます。');
    if (!userConfirmed) return;

    setLoading(true);
    try {
      const cardsInSetQuery = query(collection(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`), where("setId", "==", setId));
      const querySnapshot = await getDocs(cardsInSetQuery);
      const deleteCardPromises = querySnapshot.docs.map(async (cardDoc) => {
        const cardData = cardDoc.data();
        if (cardData.imageUrl && firebaseStorage) {
          try {
            const url = new URL(cardData.imageUrl);
            const path = decodeURIComponent(url.pathname);
            const storageBucketPath = url.hostname.split('.')[0];
            const fullPath = path.startsWith('/o/') ? path.substring(3) : path;
            const imagePath = fullPath.startsWith(`${storageBucketPath}/`) ? fullPath.substring(storageBucketPath.length + 1) : fullPath;
            const storageRef = ref(firebaseStorage, imagePath);
            await deleteObject(storageRef);
          } catch (storageError) {
            console.warn(`Warning: Could not delete front image for card ${cardDoc.id} from Storage:`, storageError);
          }
        }
        if (cardData.backFaceImageUrl && firebaseStorage) {
          try {
            const url = new URL(cardData.backFaceImageUrl);
            const path = decodeURIComponent(url.pathname);
            const storageBucketPath = url.hostname.split('.')[0];
            const fullPath = path.startsWith('/o/') ? path.substring(3) : path;
            const imagePath = fullPath.startsWith(`${storageBucketPath}/`) ? fullPath.substring(storageBucketPath.length + 1) : fullPath;
            const storageRef = ref(firebaseStorage, imagePath);
            await deleteObject(storageRef);
          } catch (storageError) {
            console.warn(`Warning: Could not delete back image for card ${cardDoc.id} from Storage:`, storageError);
          }
        }
        return deleteDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardDoc.id));
      });
      await Promise.all(deleteCardPromises);

      await deleteDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/sets`, setId));

      if (currentSetId === setId) {
        setCurrentSetId(sets.length > 1 ? sets.find(s => s.id !== setId)?.id : null);
      }

    } catch (error) {
      console.error("Error deleting set:", error);
    } finally {
      setLoading(false);
    }
  };


  // フィルタリングされたカードの取得
  const getFilteredCards = useCallback(() => {
    return cards.filter(card => {
      if (currentSetId && card.setId !== currentSetId) return false;

      if (filters.colors.length > 0) {
        const cardColors = Array.isArray(card.color) ? card.color : [card.color];
        const hasMulticolorFilter = filters.colors.includes('多色');
        const specificColorFilters = filters.colors.filter(c => c !== '多色');
        let colorMatch = false;
        if (hasMulticolorFilter && cardColors.length > 1) {
            colorMatch = true;
        }
        if (specificColorFilters.length > 0) {
            if (cardColors.some(c => specificColorFilters.includes(c))) {
                colorMatch = true;
            }
        }
        if (!colorMatch) return false;
      }

      if (filters.rarities.length > 0 && !filters.rarities.includes(card.rarity)) return false;
      if (filters.types.length > 0 && !filters.types.includes(card.type)) return false;
      if (filters.isBomb && !card.isBomb) return false;
      if (filters.customAttributeIds.length > 0) {
        if (!card.customAttributeIds || !filters.customAttributeIds.every(id => card.customAttributeIds.includes(id))) {
          return false;
        }
      }
      if (filters.searchTerm) {
        const lowerCaseSearchTerm = filters.searchTerm.toLowerCase();
        const cardNameMatch = card.name && card.name.toLowerCase().includes(lowerCaseSearchTerm);
        const commentMatch = card.comment && card.comment.toLowerCase().includes(lowerCaseSearchTerm);
        if (!cardNameMatch && !commentMatch) return false;
      }
      return true;
    });
  }, [cards, filters, currentSetId]);

  // ソートされたカードの取得
  const getSortedCards = useCallback((filteredCards) => {
    const sorted = [...filteredCards].sort((a, b) => {
      const manaA = a.manaCost !== undefined && a.manaCost !== null ? a.manaCost : Infinity;
      const manaB = b.manaCost !== undefined && b.manaCost !== null ? b.manaCost : Infinity;
      const ratingA = a.rating !== undefined && a.rating !== null ? a.rating : -1;
      const ratingB = b.rating !== undefined && b.rating !== null ? b.rating : -1;
      const colorsLengthA = (a.color || []).length;
      const colorsLengthB = (b.color || []).length;
      const nameA = a.name || '';
      const nameB = b.name || '';

      const defaultSort = () => {
        if (manaA !== manaB) return manaA - manaB;
        if (ratingB !== ratingA) return ratingB - ratingA;
        return colorsLengthA - colorsLengthB;
      };

      switch (sortBy) {
        case 'rating-desc':
          if (ratingB !== ratingA) return ratingB - ratingA;
          return defaultSort();
        case 'rating-asc':
          if (ratingA !== ratingB) return ratingA - ratingB;
          return defaultSort();
        case 'manaCost-asc':
          if (manaA !== manaB) return manaA - manaB;
          return defaultSort();
        case 'manaCost-desc':
          if (manaB !== manaA) return manaB - manaA;
          return defaultSort();
        case 'name-asc':
          const nameCompareAsc = nameA.localeCompare(nameB);
          if (nameCompareAsc !== 0) return nameCompareAsc;
          return defaultSort();
        case 'name-desc':
          const nameCompareDesc = nameB.localeCompare(nameA);
          if (nameCompareDesc !== 0) return nameCompareDesc;
          return defaultSort();
        case 'default':
        default:
          return defaultSort();
      }
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
        tiers['0'].push(card);
      }
    });

    Object.keys(tiers).forEach(tierKey => {
      tiers[tierKey].sort((a, b) => (a.rating || 0) - (b.rating || 0));
    });

    return tiers;
  }, [filteredAndSortedCards]);

  const tieredCards = getTieredCards();

  // カードアップロードモーダル
  const CardUploadModal = ({ isOpen, onClose, onUpload, sets, currentSetId }) => {
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [selectedColors, setSelectedColors] = useState([]);
    const [uploadSetId, setUploadSetId] = useState(currentSetId || '');
    const [isDoubleFaced, setIsDoubleFaced] = useState(false);
    const [backFaceFile, setBackFaceFile] = useState(null);
    const fileInputRef = useRef(null);
    const backFaceFileInputRef = useRef(null);

    useEffect(() => {
      if (currentSetId && currentSetId !== uploadSetId) {
        setUploadSetId(currentSetId);
      }
    }, [currentSetId, uploadSetId]);

    const handleFileChange = (e) => {
      setSelectedFiles(Array.from(e.target.files));
    };

    const handleBackFaceFileChange = (e) => {
      setBackFaceFile(e.target.files[0]);
    };

    const handleColorToggle = (color) => {
      setSelectedColors(prev =>
        prev.includes(color) ? prev.filter(c => c !== color) : [...prev, color]
      );
    };

    const handleSubmit = () => {
      if (selectedFiles.length === 0) {
        console.error("ファイルを1つ以上選択してください。");
        return;
      }
      if (!uploadSetId) {
        console.error("カードをアップロードするセットを選択してください。");
        return;
      }
      if (selectedColors.length === 0) {
        console.error("カードの色を1つ以上選択してください。");
        return;
      }
      if (isDoubleFaced && selectedFiles.length !== 1) {
        console.error("裏表のあるカードをアップロードする場合、表面の画像は1枚のみ選択してください。");
        return;
      }
      if (isDoubleFaced && !backFaceFile) {
        console.error("裏表のあるカードの場合、裏面画像も選択してください。");
        return;
      }

      onUpload(selectedFiles, selectedColors, uploadSetId, isDoubleFaced, backFaceFile);
      setSelectedFiles([]);
      setSelectedColors([]);
      setIsDoubleFaced(false);
      setBackFaceFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (backFaceFileInputRef.current) backFaceFileInputRef.current.value = '';
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カード画像をアップロード">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            カードの色 (複数選択可)
          </label>
          <div className="flex flex-wrap gap-2">
            {PRIMARY_COLORS.map(color => (
              <label key={color} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedColors.includes(color)}
                  onChange={() => handleColorToggle(color)}
                  className="form-checkbox h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-gray-800 text-sm">{color}</span>
              </label>
            ))}
          </div>
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
          <label className="block w-full text-gray-700 text-sm font-bold mb-2" htmlFor="card-images">
            表面画像ファイルを選択 (複数選択可、DFCは1枚)
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
              選択中の表面ファイル: {selectedFiles.map(f => f.name).join(', ')}
            </div>
          )}
        </div>
        <div className="mb-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isDoubleFaced}
              onChange={(e) => setIsDoubleFaced(e.target.checked)}
              className="form-checkbox h-4 w-4 text-blue-600 rounded"
            />
            <span className="text-gray-800 text-sm">このカードは裏表がありますか？</span>
          </label>
        </div>
        {isDoubleFaced && (
          <div className="mb-4">
            <label className="block w-full text-gray-700 text-sm font-bold mb-2" htmlFor="back-face-image">
              裏面画像ファイルを選択 (1枚のみ)
            </label>
            <input
              type="file"
              id="back-face-image"
              accept="image/*"
              onChange={handleBackFaceFileChange}
              ref={backFaceFileInputRef}
              className="block w-full text-sm text-gray-500
                         file:mr-4 file:py-2 file:px-4
                         file:rounded-md file:border-0
                         file:text-sm file:font-semibold
                         file:bg-blue-50 file:text-blue-700
                         hover:file:bg-blue-100"
            />
            {backFaceFile && (
              <div className="mt-2 text-sm text-gray-600">
                選択中の裏面ファイル: {backFaceFile.name}
              </div>
            )}
          </div>
        )}
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
  const CardEditModal = ({ isOpen, onClose, card, onSave, onDelete, sets }) => {
    const [editedCard, setEditedCard] = useState(card);
    const backFaceFileInputRef = useRef(null);

    useEffect(() => {
      setEditedCard(card);
    }, [card]);

    if (!editedCard) return null;

    const handleChange = (e) => {
      const { name, value, type, checked } = e.target;
      if (name === 'color') {
        const currentColor = Array.isArray(editedCard.color) ? editedCard.color : [];
        const newColors = checked
          ? [...currentColor, value]
          : currentColor.filter(c => c !== value);
        setEditedCard(prev => ({ ...prev, color: newColors }));
      } else {
        setEditedCard(prev => ({
          ...prev,
          [name]: type === 'checkbox' ? checked : (name === 'rating' ? parseFloat(value) : (name === 'manaCost' ? parseInt(value) : value))
        }));
      }
    };

    const handleBackFaceFileChange = async (e) => {
      const file = e.target.files[0];
      if (!file || !firebaseStorage || !userId) return;

      setLoading(true);
      try {
        const storageRef = ref(firebaseStorage, `card_images/${userId}/back_${file.name}`);
        await uploadBytes(storageRef, file);
        const newBackFaceImageUrl = await getDownloadURL(storageRef);
        setEditedCard(prev => ({ ...prev, backFaceImageUrl: newBackFaceImageUrl }));
      } catch (error) {
        console.error("Error uploading back face image:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleSubmit = () => {
      onSave(editedCard.id, editedCard);
      onClose();
    };

    const handleDelete = () => {
      onDelete(editedCard.id, editedCard.imageUrl, editedCard.backFaceImageUrl);
      onClose();
    };

    return (
      <Modal isOpen={isOpen} onClose={onClose} title="カードを編集">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex justify-center mb-4">
            {editedCard.imageUrl ? (
              <img src={editedCard.imageUrl} alt={editedCard.name} className="h-auto rounded-md shadow-md" style={{ width: 'auto', height: 'auto', maxWidth: '795px', maxHeight: '1110px' }} />
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
            <div className="flex flex-wrap gap-2">
              {PRIMARY_COLORS.map(color => (
                <label key={color} className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name="color"
                    value={color}
                    checked={Array.isArray(editedCard.color) && editedCard.color.includes(color)}
                    onChange={handleChange}
                    className="form-checkbox h-4 w-4 text-blue-600 rounded"
                  />
                  <span className="text-gray-800 text-sm">{color}</span>
                </label>
              ))}
            </div>
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
          <div>
            <label className="block text-gray-700 text-sm font-bold mb-2">セット:</label>
            <select
              name="setId"
              value={editedCard.setId || ''}
              onChange={handleChange}
              className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            >
              <option value="">セットを選択</option>
              {sets.map(set => (
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
          <div className="md:col-span-2">
            <label className="flex items-center space-x-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                name="isDoubleFaced"
                checked={editedCard.isDoubleFaced || false}
                onChange={handleChange}
                className="form-checkbox h-4 w-4 text-blue-600 rounded"
              />
              <span className="text-gray-800 text-sm">裏表のあるカード</span>
            </label>
            {editedCard.isDoubleFaced && (
              <div className="mt-2">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-back-face-image">
                  裏面画像URL:
                </label>
                <input
                  type="text"
                  name="backFaceImageUrl"
                  value={editedCard.backFaceImageUrl || ''}
                  onChange={handleChange}
                  className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline mb-2"
                  placeholder="裏面画像のURL (またはアップロード)"
                />
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="edit-back-face-file">
                  裏面画像をアップロード:
                </label>
                <input
                  type="file"
                  id="edit-back-face-file"
                  accept="image/*"
                  onChange={handleBackFaceFileChange}
                  ref={backFaceFileInputRef}
                  className="block w-full text-sm text-gray-500
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-md file:border-0
                             file:text-sm file:font-semibold
                             file:bg-blue-50 file:text-blue-700
                             hover:file:bg-blue-100"
                />
                {editedCard.backFaceImageUrl && (
                  <div className="mt-2 text-sm text-gray-600">
                    現在の裏面画像: <a href={editedCard.backFaceImageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate inline-block max-w-full">{editedCard.backFaceImageUrl}</a>
                  </div>
                )}
              </div>
            )}
          </div>
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
        console.error("属性名を入力してください。");
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
        console.error("セット名を入力してください。");
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
    const unassignedCards = cards.filter(card => !card.rarity || card.rarity === '');
    const [selectedCards, setSelectedCards] = useState([]);
    const [selectedRarity, setSelectedRarity] = useState('');

    useEffect(() => {
      setSelectedCards([]);
      setSelectedRarity('');
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

    const handleApplyRarity = async () => {
      if (selectedCards.length === 0 || !selectedRarity) {
        console.error("カードとレアリティを選択してください。");
        return;
      }

      setLoading(true);
      const updates = selectedCards.map(cardId =>
        updateDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardId), { rarity: selectedRarity, updatedAt: new Date() })
      );

      try {
        await Promise.all(updates);
        onClose();
      } catch (error) {
        console.error("Error updating rarities:", error);
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
          onClick={handleApplyRarity}
          disabled={selectedCards.length === 0 || !selectedRarity}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save size={20} /> レアリティを適用
        </button>
      </Modal>
    );
  };

  // カードタイプ一括割り当てモーダル
  const TypeAssignmentModal = ({ isOpen, onClose, cards, onUpdateCards }) => {
    const unassignedCards = cards.filter(card => !card.type || card.type === '');
    const [selectedCards, setSelectedCards] = useState([]);
    const [selectedType, setSelectedType] = useState('');

    useEffect(() => {
      setSelectedCards([]);
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
        console.error("カードとタイプを選択してください。");
        return;
      }

      setLoading(true);
      const updates = selectedCards.map(cardId =>
        updateDoc(doc(firestoreDb, `artifacts/${APP_ID}/users/${userId}/cards`, cardId), { type: selectedType, updatedAt: new Date() })
      );

      try {
        await Promise.all(updates);
        onClose();
      } catch (error) {
        console.error("Error updating types:", error);
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
            className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline w-1/2"
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
          <div>
            <label className="block text-gray-700 font-semibold mb-2 flex items-center gap-1"><Palette size={16} /> 色:</label>
            <div className="flex flex-wrap gap-2">
              {FILTER_COLORS.map(color => (
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

          <div className="flex items-center gap-2 ml-auto">
            <label htmlFor="sort-by" className="text-gray-700 font-semibold">並べ替え:</label>
            <select
              id="sort-by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="default">デフォルト (コスト順 > 評価順 > 色順)</option>
              <option value="rating-desc">評価 (高い順)</option>
              <option value="rating-asc">評価 (低い順)</option>
              <option value="manaCost-asc">コスト (低い順)</option>
              <option value="manaCost-desc">コスト (高い順)</option>
              <option value="name-asc">名前 (A-Z)</option>
              <option value="name-desc">名前 (Z-A)</option>
            </select>
          </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 xl:grid-cols-7 gap-6">
                {filteredAndSortedCards.map(card => (
                  <CardItem
                    key={card.id}
                    card={card}
                    onEdit={setEditingCard}
                    onToggleBomb={handleToggleBomb}
                    onRatingChange={handleRatingChange}
                    onManaCostChange={handleManaCostChange}
                    onToggleCustomAttribute={handleToggleCustomAttribute}
                    customAttributes={customAttributes}
                    isStealthMode={isStealthMode}
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 xl:grid-cols-7 gap-6">
                        {tieredCards[tierKey].map(card => (
                          <CardItem
                            key={card.id}
                            card={card}
                            onEdit={setEditingCard}
                            onToggleBomb={handleToggleBomb}
                            onRatingChange={handleRatingChange}
                            onManaCostChange={handleManaCostChange}
                            onToggleCustomAttribute={handleToggleCustomAttribute}
                            customAttributes={customAttributes}
                            isStealthMode={isStealthMode}
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
        sets={sets}
        currentSetId={currentSetId}
      />
      {editingCard && (
        <CardEditModal
          isOpen={isEditModalOpen || editingCard !== null}
          onClose={() => { setEditingCard(null); setIsEditModalOpen(false); }}
          card={editingCard}
          onSave={handleUpdateCard}
          onDelete={handleDeleteCard}
          sets={sets}
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
        cards={cards}
        onUpdateCards={handleUpdateCard}
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
    </div>
  );
}

export default App;
