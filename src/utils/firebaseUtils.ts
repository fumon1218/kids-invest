import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { UserData } from '../types';
import { defaultUserData } from '../data';

// 컬렉션 이름 지정 (다른 앱과 분리하기 위해 고유한 이름 사용)
const COLLECTION_NAME = 'kidsInvestUsers';

export const loadUserDataFromDB = async (uid: string): Promise<UserData> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserData;
    } else {
      // 문서가 없으면 기본 데이터 생성
      await setDoc(docRef, defaultUserData);
      return defaultUserData;
    }
  } catch (error) {
    console.error("Error loading user data from DB:", error);
    return defaultUserData;
  }
};

export const saveUserDataToDB = async (uid: string, data: UserData): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION_NAME, uid);
    await setDoc(docRef, data);
  } catch (error) {
    console.error("Error saving user data to DB:", error);
  }
};
