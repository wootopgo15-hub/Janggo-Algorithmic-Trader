import React, { useState } from 'react';
import { Key, Lock, CheckCircle2, XCircle } from 'lucide-react';

interface BitgetApiLoginProps {
  onConnect: (apiKey: string, secretKey: string, passphrase?: string) => void;
  status: 'Disconnected' | 'Connected' | 'Error';
}

export const BitgetApiLogin: React.FC<BitgetApiLoginProps> = ({ onConnect, status }) => {
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKey && secretKey) {
      onConnect(apiKey, secretKey, passphrase);
      setIsOpen(false);
    }
  };

  if (!isOpen && status === 'Connected') {
    return (
      <div className="bg-[#0A0D14] border-b border-gray-800 p-2 flex justify-between items-center px-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]"></div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">비트겟 선물 API: 연결됨</span>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="text-[10px] text-gray-500 hover:text-blue-400 uppercase tracking-widest font-bold transition-colors"
        >
          설정
        </button>
      </div>
    );
  }

  return (
    <div className="bg-[#050608] border-b border-gray-800">
      <div className="p-4 flex flex-col md:flex-row gap-6 items-center justify-between">
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Key className="text-blue-500" size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-200 uppercase tracking-wide">비트겟 선물 API 인증</h2>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">실시간 트레이딩을 위해 비트겟 선물 V2 API에 연결하세요</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Key size={14} className="text-gray-500" />
            </div>
            <input
              type="text"
              placeholder="API 키"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-[#0C0E14] border border-gray-700 text-gray-300 text-xs rounded pl-9 pr-3 py-2 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
              required
            />
          </div>

          <div className="relative w-full md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={14} className="text-gray-500" />
            </div>
            <input
              type="password"
              placeholder="시크릿 키"
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="w-full bg-[#0C0E14] border border-gray-700 text-gray-300 text-xs rounded pl-9 pr-3 py-2 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
              required
            />
          </div>

          <div className="relative w-full md:w-48">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock size={14} className="text-gray-500" />
            </div>
            <input
              type="password"
              placeholder="비밀번호 (PASSPHRASE)"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full bg-[#0C0E14] border border-gray-700 text-gray-300 text-xs rounded pl-9 pr-3 py-2 font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-gray-600"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full md:w-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded tracking-widest uppercase transition-all shadow-[0_0_15px_rgba(37,99,235,0.2)] disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            disabled={!apiKey || !secretKey}
          >
            API 연결
          </button>
          
          {isOpen && status === 'Connected' && (
            <button 
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
            >
              <XCircle size={20} />
            </button>
          )}
        </form>

      </div>
    </div>
  );
};
