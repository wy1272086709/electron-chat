import { useEffect, useState } from 'react'
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from 'react'
import AvaterSvg from '@renderer/assets/avatar.svg'
import { secureStorageService } from '../services/secure-storage.service'
import userService from '@renderer/services/user.service'

export interface Profile {
  username: string
  nickname: string
  email: string
  avatar: string
  avatarUrl: string
}

const initialProfile: Profile = {
  username: '',
  nickname: '',
  email: '',
  avatar: AvaterSvg,
  avatarUrl: ''
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
    }
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
      // 发送请求到后端获取 presigned URL
      userService.getPresignedUrl(file.name).then((res) => {
        if (res?.data?.url) {
          fetch(res.data.url, {
            method: 'PUT',
            headers: {},
            body: file
          })
            .then((res) => {
              console.log('Upload response:', res)
              if (res.ok) {
                setProfile((prev) => ({
                  ...prev,
                  avatarUrl: res.url
                }))
              }
            })
            .catch((err) => {
              console.error('Upload error:', err)
            })
        }
      })
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit: (e: FormEvent) => void = (e: FormEvent) => {
    e.preventDefault()
    console.log('Profile updated:', profile)
    // 发送请求到后端更新用户信息
    userService
      .updateUserInfo({
        nickname: profile.nickname,
        avatarUrl: profile.avatarUrl,
        email: profile.email,
        username: profile.username,
      })
      .then(async (res) => {
        if (res?.data?.username) {
          onSubmitSuccess?.()
        }
      })
  }

  return {
    profile,
    setProfile,
    handleInputChange,
    handleAvatarChange,
    handleSubmit
  }
}
