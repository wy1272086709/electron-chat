import { useEffect, useState } from 'react'
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react'
import AvaterSvg from '@renderer/assets/avatar.svg'
import { secureStorageService } from '../services/secure-storage.service'

export interface Profile {
  username: string
  nickname: string
  email: string
  avatar: string
}

const initialProfile: Profile = {
  username: '',
  nickname: '',
  email: '',
  avatar: AvaterSvg
}

interface UseProfileOptions {
  onSubmitSuccess?: () => void
}

interface UseProfileResult {
  profile: Profile
  setProfile: Dispatch<SetStateAction<Profile>>
  handleInputChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleAvatarChange: (e: ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (e: FormEvent) => void
}

export function useProfile(options: UseProfileOptions = {}): UseProfileResult {
  const { onSubmitSuccess } = options
  const [profile, setProfile] = useState<Profile>({
    ...initialProfile
  })
  useEffect(() => {
    const setProfileInfo: () => Promise<void> = async () => {
      // 从 secure-storage.service.ts 中获取用户信息
      const userInfo = await secureStorageService.getUserInfo()
      if (userInfo) {
        setProfile({
          ...profile,
          username: userInfo.username || '',
          nickname: userInfo.nickname || '',
          email: userInfo.email || ''
        })
      }
    };
    setProfileInfo()
  }, [])

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const dom = e.target
    const name = dom.getAttribute('name') as string
    const value = dom.value
    setProfile((prev) => ({
      ...prev,
      [name]: value
    }))
  }

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      const avatar = reader.result

      setProfile((prev) => ({
        ...prev,
        avatar
      }))
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit: (e: FormEvent) => void = (e: FormEvent) => {
    e.preventDefault()
    console.log('Profile updated:', profile)
    onSubmitSuccess?.()
  }

  return {
    profile,
    setProfile,
    handleInputChange,
    handleAvatarChange,
    handleSubmit
  }
}
